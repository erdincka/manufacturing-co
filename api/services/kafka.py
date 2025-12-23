import datetime
import logging
import json
import time
from typing import List, Dict, Any, Optional
from services.base import BaseDataFabricService

logger = logging.getLogger("api.services.kafka")

try:
    from kafka import KafkaAdminClient, KafkaProducer, KafkaConsumer, TopicPartition
    from kafka.admin import NewTopic
    from kafka.errors import KafkaError, TopicAlreadyExistsError

    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False


class KafkaService(BaseDataFabricService):
    def _get_kafka_config(self, bootstrap_servers: str):
        config = {
            "bootstrap_servers": bootstrap_servers,
            "request_timeout_ms": 30000,
            "api_version": (2, 0),  # Correct format (major, minor)
            "api_version_auto_timeout_ms": 10000,  # Increased significantly for slow handshakes
        }

        if self.username and self.password:
            config.update(
                {
                    "security_protocol": "SASL_PLAINTEXT",
                    "sasl_mechanism": "PLAIN",
                    "sasl_plain_username": self.username,
                    "sasl_plain_password": self.password,
                }
            )
        return config

    def test_kafka(self) -> Dict[str, Any]:
        if not KAFKA_AVAILABLE:
            return {"status": "error", "message": "kafka-python not available"}

        bootstrap_servers = f"{self.cluster_host}:9092"
        try:
            admin_client = KafkaAdminClient(**self._get_kafka_config(bootstrap_servers))
            metadata = admin_client.list_topics()
            admin_client.close()
            return {
                "status": "success",
                "message": "Kafka API accessible",
                "topics_count": len(metadata) if metadata else 0,
            }
        except Exception as e:
            return {"status": "error", "message": f"Kafka error: {str(e)}"}

    def list_topics(self) -> List[Dict[str, Any]]:
        if not KAFKA_AVAILABLE:
            return []
        bootstrap_servers = f"{self.cluster_host}:9092"
        try:
            admin_client = KafkaAdminClient(**self._get_kafka_config(bootstrap_servers))
            topic_names = admin_client.list_topics()
            if not topic_names:
                admin_client.close()
                return []

            # Use consumer to get metadata as it's often more resilient to ACL parsing bugs than AdminClient.describe_topics
            consumer = KafkaConsumer(
                **self._get_kafka_config(bootstrap_servers),
                group_id="metadata-fetcher",
                enable_auto_commit=False,
            )
            metadata = consumer.partitions_for_topic

            topics_data = []
            for name in topic_names:
                partitions = metadata(name)
                topics_data.append(
                    {
                        "name": name,
                        "partitions": len(partitions) if partitions else 0,
                        "replication": 1,  # Default if we can't easily get it from consumer
                    }
                )

            consumer.close()
            admin_client.close()
            return topics_data
        except Exception as e:
            logger.error(f"Error listing topics: {e}")
            # Fallback to just names if metadata fetch fails
            try:
                admin_client = KafkaAdminClient(
                    **self._get_kafka_config(bootstrap_servers)
                )
                names = admin_client.list_topics()
                admin_client.close()
                return [{"name": n, "partitions": 0} for n in names]
            except:
                return []

    def create_topic(
        self, topic_name: str, partitions: int = 1, replication_factor: int = 1
    ) -> Dict[str, Any]:
        if not KAFKA_AVAILABLE:
            return {"status": "error", "message": "kafka-python not available"}

        bootstrap_servers = f"{self.cluster_host}:9092"
        try:
            admin_client = KafkaAdminClient(**self._get_kafka_config(bootstrap_servers))
            new_topic = NewTopic(
                name=topic_name,
                num_partitions=partitions,
                replication_factor=replication_factor,
            )
            admin_client.create_topics(new_topics=[new_topic], validate_only=False)
            admin_client.close()
            return {
                "status": "success",
                "outcome": "created",
                "message": f"Topic {topic_name} created",
                "topic": {"name": topic_name, "partitions": partitions},
            }
        except TopicAlreadyExistsError:
            return {
                "status": "success",
                "outcome": "skipped",
                "message": f"Topic {topic_name} exists",
                "topic": {"name": topic_name},
            }
        except Exception as e:
            logger.error(f"Error creating topic: {e}")
            return {"status": "error", "message": str(e)}

    def get_topic_metrics(
        self, topic_name: str, consumer_group: str = "manufacturing-consumer-group"
    ) -> Dict[str, Any]:
        if not KAFKA_AVAILABLE:
            return {}
        bootstrap_servers = f"{self.cluster_host}:9092"
        metrics = {
            "topic": topic_name,
            "messages_count": 0,
            "recent_message": None,
            "delay_seconds": 0,
            "partitions": 0,
            "consumers": 1,
            "in_queue": 0,
        }

        try:
            # Re-open for data fetching
            consumer = KafkaConsumer(
                **self._get_kafka_config(bootstrap_servers),
                group_id=f"dashboard-metrics-loader-{topic_name}",
                session_timeout_ms=10000,
                auto_offset_reset="earliest",
                enable_auto_commit=False,
                consumer_timeout_ms=1000,
            )

            partitions_info = consumer.partitions_for_topic(topic_name)
            if not partitions_info:
                consumer.close()
                return metrics

            from kafka import TopicPartition

            tp_list = [TopicPartition(topic_name, p) for p in partitions_info]

            # Get end offsets
            end_offsets = consumer.end_offsets(tp_list)
            beginning_offsets = consumer.beginning_offsets(tp_list)

            total_msgs = sum(end_offsets[tp] - beginning_offsets[tp] for tp in tp_list)
            metrics["messages_count"] = total_msgs
            metrics["partitions"] = len(partitions_info)

            # Try to get committed offsets for the processing group to calculate real lag
            try:
                # Use a consumer to get committed offsets instead of AdminClient (more resilient to protocol versions)
                lag_consumer = KafkaConsumer(
                    **self._get_kafka_config(bootstrap_servers),
                    group_id=consumer_group,
                    enable_auto_commit=False,
                )

                total_lag = 0
                oldest_unprocessed_ts = None

                # Check committed offsets for each partition
                for tp in tp_list:
                    committed_offset = lag_consumer.committed(tp)
                    # If committed_offset is None, it means no offsets have been committed for this group yet
                    comm = (
                        committed_offset
                        if committed_offset is not None
                        else beginning_offsets.get(tp, 0)
                    )

                    end = end_offsets.get(tp, 0)
                    lag = max(0, end - comm)
                    total_lag += lag

                    # If there is lag, find the timestamp of the message at the committed offset
                    if lag > 0:
                        consumer.assign([tp])
                        consumer.seek(tp, comm)
                        # Get just one message to find its timestamp
                        for msg in consumer:
                            if (
                                not oldest_unprocessed_ts
                                or msg.timestamp < oldest_unprocessed_ts
                            ):
                                oldest_unprocessed_ts = msg.timestamp
                            break

                lag_consumer.close()
                metrics["in_queue"] = total_lag
                if oldest_unprocessed_ts:
                    import datetime

                    delay = (
                        datetime.datetime.now().timestamp() * 1000
                        - oldest_unprocessed_ts
                    ) / 1000
                    metrics["delay_seconds"] = max(0, round(delay, 2))
                else:
                    metrics["delay_seconds"] = 0

            except Exception as e:
                logger.debug(f"Could not get group offsets for {consumer_group}: {e}")
                metrics["in_queue"] = 0

            # Also get the absolute latest message for the 'recent_message' preview
            last_tp = None
            max_off = -1
            for tp in tp_list:
                if end_offsets[tp] > beginning_offsets[tp]:
                    if end_offsets[tp] > max_off:
                        max_off = end_offsets[tp]
                        last_tp = tp

            if last_tp:
                consumer.assign([last_tp])
                consumer.seek(last_tp, end_offsets[last_tp] - 1)
                for msg in consumer:
                    metrics["recent_message"] = (
                        msg.value.decode("utf-8", errors="ignore")
                        if isinstance(msg.value, bytes)
                        else str(msg.value)
                    )
                    break

            consumer.close()
            return metrics
        except Exception as e:
            logger.error(f"Error getting metrics for topic {topic_name}: {e}")
            return metrics

    def list_messages(
        self,
        topic_name: str,
        limit: int = 50,
        timeout_ms: int = 2000,
    ) -> List[Dict[str, Any]]:
        """
        List messages from a topic without committing offsets.

        Uses a temporary consumer group and auto_offset_reset='earliest'
        so it never affects your real consumer offsets.
        """
        if not KAFKA_AVAILABLE:
            return []

        bootstrap_servers = f"{self.cluster_host}:9092"
        messages: List[Dict[str, Any]] = []

        try:
            consumer = KafkaConsumer(
                # topic_name,
                **self._get_kafka_config(bootstrap_servers),
                # group_id=f"message-browser-{topic_name}-{int(time.time())}", # disabled for auto group coordination
                enable_auto_commit=False,
                auto_offset_reset="earliest",
                consumer_timeout_ms=timeout_ms,
            )

            # Get partitions and recent offsets without group
            partitions_info = consumer.partitions_for_topic(topic_name)
            if not partitions_info:
                consumer.close()
                return []
            tp_list = [TopicPartition(topic_name, p) for p in partitions_info]
            consumer.assign(tp_list)  # Manual assignment - no group needed

            # Seek to recent messages (your original logic)
            end_offsets = consumer.end_offsets(tp_list)
            msgs_per_partition = max(1, limit // len(tp_list))

            for tp in tp_list:
                start_off = max(0, end_offsets[tp] - msgs_per_partition)
                consumer.seek(tp, start_off)

            count = 0
            for msg in consumer:
                payload: Any = msg.value
                if isinstance(payload, bytes):
                    try:
                        payload = json.loads(payload.decode("utf-8"))
                    except Exception:
                        payload = payload.decode("utf-8", errors="ignore")

                messages.append(
                    {
                        "partition": msg.partition,
                        "offset": msg.offset,
                        "timestamp": (
                            datetime.datetime.fromtimestamp(
                                msg.timestamp / 1000.0,
                                tz=datetime.timezone.utc,
                            ).isoformat()
                            if msg.timestamp
                            else None
                        ),
                        "value": payload,
                    }
                )
                count += 1
                if count >= limit:
                    break

            consumer.close()

            # sort by timestamp desc for a more “recent-first” feel
            messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return messages

        except Exception as e:
            logger.error(f"Error listing messages for {topic_name}: {e}")
            return []

    def consume_messages(
        self,
        topic_name: str,
        limit: Optional[int] = None,
        group_id: str = "app-consumer",
        timeout_ms: int = 2000,
        commit_async: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Consume messages from a topic and commit offsets.

        - Uses a *stable* consumer group_id so offsets are remembered.
        - If limit is None, consumes until consumer_timeout_ms elapses.
        - Commits after reading the batch (sync or async).
        """
        if not KAFKA_AVAILABLE:
            return []

        bootstrap_servers = f"{self.cluster_host}:9092"
        messages: List[Dict[str, Any]] = []

        try:
            consumer = KafkaConsumer(
                topic_name,
                **self._get_kafka_config(bootstrap_servers),
                group_id=group_id,
                enable_auto_commit=False,  # explicit commits
                auto_offset_reset="earliest",
                consumer_timeout_ms=timeout_ms,
            )

            count = 0
            for msg in consumer:
                payload: Any = msg.value
                if isinstance(payload, bytes):
                    try:
                        payload = json.loads(payload.decode("utf-8"))
                    except Exception:
                        payload = payload.decode("utf-8", errors="ignore")

                messages.append(
                    {
                        "partition": msg.partition,
                        "offset": msg.offset,
                        "timestamp": (
                            datetime.datetime.fromtimestamp(
                                msg.timestamp / 1000.0,
                                tz=datetime.timezone.utc,
                            ).isoformat()
                            if msg.timestamp
                            else None
                        ),
                        "value": payload,
                    }
                )
                count += 1
                if limit is not None and count >= limit:
                    break

            # commit offsets for everything consumed in this batch
            if messages:
                if commit_async:
                    future = consumer.commit_async()
                    future.add_callback(
                        lambda resp: logger.info(f"Committed async offsets: {resp}")
                    )
                else:
                    consumer.commit()

            consumer.close()
            return messages

        except Exception as e:
            logger.error(f"Error consuming messages for {topic_name}: {e}")
            return []

    # def list_messages(
    #     self, topic_name: str, limit: int = 50, commit: bool = False
    # ) -> List[Dict[str, Any]]:
    #     """Fetch recent messages from a topic."""
    #     if not KAFKA_AVAILABLE:
    #         return []
    #     bootstrap_servers = f"{self.cluster_host}:9092"
    #     messages = []
    #     try:
    #         consumer = KafkaConsumer(
    #             **self._get_kafka_config(bootstrap_servers),
    #             group_id=f"message-browser-{topic_name}-{int(time.time())}",
    #             auto_offset_reset="earliest",
    #             enable_auto_commit=False,
    #             consumer_timeout_ms=2000,
    #         )

    #         partitions_info = consumer.partitions_for_topic(topic_name)
    #         # logger.debug(partitions_info)
    #         if not partitions_info:
    #             consumer.close()
    #             return []

    #         tp_list = [TopicPartition(topic_name, p) for p in partitions_info]
    #         # logger.debug(tp_list)
    #         end_offsets = consumer.end_offsets(tp_list)
    #         # logger.debug(end_offsets)

    #         # Seek to near the end for each partition to get 'recent' messages
    #         msgs_per_partition = max(1, limit // len(tp_list))
    #         # logger.debug(msgs_per_partition)
    #         consumer.assign(tp_list)
    #         for tp in tp_list:
    #             start_off = max(0, end_offsets[tp] - msgs_per_partition)
    #             consumer.seek(tp, start_off)

    #         count = 0
    #         import datetime

    #         for msg in consumer:
    #             payload = msg.value
    #             if isinstance(payload, bytes):
    #                 try:
    #                     payload = json.loads(payload.decode("utf-8"))
    #                 except:
    #                     payload = payload.decode("utf-8", errors="ignore")

    #             messages.append(
    #                 {
    #                     "partition": msg.partition,
    #                     "offset": msg.offset,
    #                     "timestamp": (
    #                         datetime.datetime.fromtimestamp(
    #                             msg.timestamp / 1000.0, tz=datetime.timezone.utc
    #                         ).isoformat()
    #                         if msg.timestamp
    #                         else None
    #                     ),
    #                     "value": payload,
    #                 }
    #             )
    #             count += 1
    #             if count >= limit:
    #                 break

    #         if commit:
    #             future = consumer.commit_async(end_offsets)
    #             future.add_callback(lambda resp: logger.info(f"Committed: {resp}"))
    #         consumer.close()
    #         # Sort by timestamp descending
    #         messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    #         return messages
    #     except Exception as e:
    #         logger.error(f"Error listing messages for {topic_name}: {e}")
    #         return []

    def list_unprocessed_messages(
        self,
        topic_name: str,
        limit: int = 50,
        consumer_group: str = "manufacturing-consumer-group",
    ) -> List[Dict[str, Any]]:
        """Peek at unprocessed messages without committing offsets."""
        if not KAFKA_AVAILABLE:
            return []
        bootstrap_servers = f"{self.cluster_host}:9092"
        messages = []

        try:
            # Create a consumer with the target group to get committed offsets
            consumer = KafkaConsumer(
                **self._get_kafka_config(bootstrap_servers),
                group_id=consumer_group,
                enable_auto_commit=False,
                consumer_timeout_ms=2000,
            )

            partitions_info = consumer.partitions_for_topic(topic_name)
            if not partitions_info:
                consumer.close()
                return []

            tp_list = [TopicPartition(topic_name, p) for p in partitions_info]
            logger.debug(tp_list)

            # Get committed offsets and end offsets
            consumer.assign(tp_list)
            end_offsets = consumer.end_offsets(tp_list)
            logger.debug(end_offsets)

            # Seek to committed offset for each partition
            for tp in tp_list:
                committed = consumer.committed(tp)
                if committed is not None:
                    consumer.seek(tp, committed)
                else:
                    # No offset committed yet, start from beginning
                    consumer.seek_to_beginning(tp)

            # Fetch messages
            count = 0

            for msg in consumer:
                payload = msg.value
                logger.debug(payload)
                if isinstance(payload, bytes):
                    try:
                        payload = json.loads(payload.decode("utf-8"))
                    except:
                        payload = payload.decode("utf-8", errors="ignore")

                messages.append(
                    {
                        "partition": msg.partition,
                        "offset": msg.offset,
                        "timestamp": (
                            datetime.datetime.fromtimestamp(
                                msg.timestamp / 1000.0, tz=datetime.timezone.utc
                            ).isoformat()
                            if msg.timestamp
                            else None
                        ),
                        "value": payload,
                    }
                )
                count += 1
                if count >= limit:
                    break

            consumer.close()
            return messages
        except Exception as e:
            logger.error(f"Error listing unprocessed messages for {topic_name}: {e}")
            return []

    def push_messages(self, topic_name: str, messages: List, limit: int = 100) -> bool:
        """
        Publish the `payload` as message to the `topic_name` topic

        :param self: Description
        :param topic_name: Description
        :type topic_name: str
        :param payload: Description
        :type payload: object
        :param limit: Description
        :type limit: int
        :return: Description
        :rtype: Dict[str, Any]
        """
        if not KAFKA_AVAILABLE:
            logger.error("No Kafka libraries!")
            return False

        # Get Kafka producer configuration from connector
        bootstrap_servers = f"{self.cluster_host}:9092"
        producer = KafkaProducer(
            **self._get_kafka_config(bootstrap_servers),
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )

        try:
            if len(messages) > limit:
                messages = messages[:100]  # trim the list to the limit
            for payload in messages:
                producer.send(topic_name, payload)
            return True

        except KafkaError as ke:
            logger.error(f"Error publishing messages for topic {topic_name}: {ke}")
            return False

        finally:
            producer.flush()
            producer.close()
