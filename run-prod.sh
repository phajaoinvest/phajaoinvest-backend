#!/bin/bash
nest build && node dist/src/main.js &
PID=$!
sleep 15
curl -s http://localhost:3000/api/v1/docs-json > swagger-prod.json
kill $PID
