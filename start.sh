#!/bin/bash
# Koloau Start Script

echo "Killing old processes..."
pkill -f "node bot/main-bot.js"
pkill -f "node server/index.js"
sleep 1

echo "Starting Koloau Builder Server..."
nohup node server/index.js > server.log 2>&1 &

echo "Starting Koloau Main Bot..."
nohup node bot/main-bot.js > main-bot.log 2>&1 &

echo "-----------------------------------"
echo "Koloau is now running in background!"
echo "Website: http://localhost:3000"
echo "Logs: tail -f server.log main-bot.log"
echo "-----------------------------------"
