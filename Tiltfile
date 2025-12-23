# -*- mode: Python -*-

# Load Kubernetes YAML
k8s_yaml('web/deployment.yaml')
k8s_yaml('api/deployment.yaml')

# WebApp (Next.js)
docker_build(
    'web',
    './web',
    dockerfile='./web/Dockerfile',
    live_update=[
        # Ignore files that shouldn't trigger syncs
        fall_back_on(['./web/package.json', './web/package-lock.json']),
        
        # Sync source files to container
        sync('./web', '/app'),
        
        # Run npm install only when package.json changes
        run('npm install', trigger=['package.json']),    
    ],
    # Ignore these directories from triggering builds
    ignore=['./web/node_modules', './web/.next']
)

k8s_resource(
    'web',
    port_forwards='3000:3000',
    labels=['web'],
    # Disable health checks for faster dev iteration
    resource_deps=[],
    auto_init=True,
    trigger_mode=TRIGGER_MODE_AUTO,
)

# API (FastAPI)
docker_build(
    'api',
    './api',
    dockerfile='./api/Dockerfile',
    live_update=[
        sync('./api', '/app'),
        run('pip install -r requirements.txt', trigger='./api/requirements.txt'),
    ]
)

k8s_resource(
    'api',
    port_forwards='8000:8000',
    labels=['api'],
)

print("""
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║      HPE Data Fabric Manufacturing Demo - Ready         ║
║                                                          ║
║  Frontend:      http://localhost:3000                    ║
║  API:           http://localhost:8000                    ║
║                                                          ║
║  Run: tilt up                                            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
""")
