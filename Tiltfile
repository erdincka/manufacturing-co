# -*- mode: Python -*-

# Change below for your env
allow_k8s_contexts('zbook')
default_registry('localhost:5000')

# Load Kubernetes YAML
k8s_yaml('backend/deployment-dev.yaml')
k8s_yaml('frontend/deployment-dev.yaml')

# WebApp (Next.js)
docker_build(
    'frontend',
    './frontend',
    dockerfile='./frontend/Dockerfile.dev',
    live_update=[
        # Ignore files that shouldn't trigger syncs
        fall_back_on(['./frontend/package.json', './frontend/package-lock.json']),
        
        # Sync source files to container
        sync('./frontend', '/app'),
        
        # Run npm install only when package.json changes
        run('npm install', trigger=['package.json']),    
    ],
    # Ignore these directories from triggering builds
    ignore=['./frontend/node_modules', './frontend/.next']
)

k8s_resource(
    'frontend',
    port_forwards='3000:3000',
    labels=['frontend'],
    # Disable health checks for faster dev iteration
    resource_deps=[],
    auto_init=True,
    trigger_mode=TRIGGER_MODE_AUTO,
)

# Backend (FastAPI)
docker_build(
    'backend',
    './backend',
    dockerfile='./backend/Dockerfile.dev',
    live_update=[
        sync('./backend', '/app'),
        run('uv pip install -r requirements.txt', trigger='./backend/requirements.txt'),
    ]
)

k8s_resource(
    'backend',
    port_forwards='8000:8000',
    labels=['backend'],
)

print("""
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║      HPE Data Fabric Manufacturing Demo - Ready          ║
║                                                          ║
║  Frontend:      http://localhost:3000                    ║
║  Backend:       http://localhost:8000                    ║
║                                                          ║
║  Run: tilt up                                            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
""")
