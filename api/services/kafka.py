import logging
from typing import List, Dict, Any, Optional
from services.base import BaseDataFabricService

logger = logging.getLogger("api.services.kafka")

try:
    from kafka import KafkaAdminClient, KafkaProducer, KafkaConsumer
    from kafka.admin import NewTopic
    from kafka.errors import KafkaError, TopicAlreadyExistsError
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False

class KafkaService(BaseDataFabricService):
    def _get_kafka_config(self, bootstrap_servers: str):
        config = {
            "bootstrap_servers": bootstrap_servers,
            "request_timeout_ms": 10000,
            "api_version": (0, 10, 1),
        }
        if self.username and self.password:
            config.update({
                "security_protocol": "SASL_PLAINTEXT",
                "sasl_mechanism": "PLAIN",
                "sasl_plain_username": self.username,
                "sasl_plain_password": self.password,
            })
        return config

    def test_kafka(self) -> Dict[str, Any]:
        if not KAFKA_AVAILABLE:
            return {"status": "error", "message": "kafka-python not available"}
        
        bootstrap_servers = f"{self.cluster_host}:9092"
        try:
            admin_client = KafkaAdminClient(**self._get_kafka_config(bootstrap_servers))
            metadata = admin_client.list_topics(timeout_ms=5000)
            admin_client.close()
            return {
                "status": "success", "message": "Kafka API accessible", 
                "topics_count": len(metadata) if metadata else 0
            }
        except Exception as e:
            return {"status": "error", "message": f"Kafka error: {str(e)}"}

    def list_topics(self) -> List[Dict[str, Any]]:
        if not KAFKA_AVAILABLE: return []
        bootstrap_servers = f"{self.cluster_host}:9092"
        try:
            admin_client = KafkaAdminClient(**self._get_kafka_config(bootstrap_servers))
            metadata = admin_client.list_topics()
            admin_client.close()
            return [{"name": t, "partitions": 0} for t in metadata] if metadata else []
        except Exception as e:
            logger.error(f"Error listing topics: {e}")
            return []

    def create_topic(self, topic_name: str, partitions: int = 1, replication_factor: int = 1) -> Dict[str, Any]:
        if not KAFKA_AVAILABLE:
            return {"status": "error", "message": "kafka-python not available"}
        
        bootstrap_servers = f"{self.cluster_host}:9092"
        try:
            admin_client = KafkaAdminClient(**self._get_kafka_config(bootstrap_servers))
            new_topic = NewTopic(name=topic_name, num_partitions=partitions, replication_factor=replication_factor)
            admin_client.create_topics(new_topics=[new_topic], validate_only=False)
            admin_client.close()
            return {
                "status": "success", "outcome": "created", "message": f"Topic {topic_name} created",
                "topic": {"name": topic_name, "partitions": partitions}
            }
        except TopicAlreadyExistsError:
            return {
                "status": "success", "outcome": "skipped", "message": f"Topic {topic_name} exists",
                "topic": {"name": topic_name}
            }
        except Exception as e:
            logger.error(f"Error creating topic: {e}")
            return {"status": "error", "message": str(e)}
