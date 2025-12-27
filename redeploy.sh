#!/usr/bin/env bash

# Remove, re-package, and re-deploy ezapp

### MAKE SURE CORRECT KUBECONFIG IS SELECTED!

# Delete the ezapp deployment
kubectl delete -f manufacturing-ezapp.yaml

# Package the chart
helm package ./helm

# Forward chartmuseum port for localhost
kubectl port-forward -n ez-chartmuseum-ns svc/chartmuseum 8080:8080 &

sleep 3

# Delete the old chart
curl -X DELETE http://localhost:8080/api/charts/manufacturing-co/0.1.0

# Upload the new chart
curl http://localhost:8080/api/charts --data-binary "@manufacturing-co-0.1.0.tgz"

# Install the ezapp
kubectl apply -f manufacturing-ezapp.yaml

# Kill the port-forward
kill %1

echo "Redeployed"
