#/usr/bin/env sh

# Disable telemetry
npx next telemetry disable
# Start the application
npm run dev -- --turbo -H 0.0.0.0
