docker run -d --name maxbot -p 127.0.0.1:3033:3000 \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e BOT_TOKEN=asdf \
  -e BOT_USERNAME=id123123123_bot \
  -e WEBHOOK_SECRET=Rasdfasdfasdf \
  -e WEBHOOK_DOMAIN=https://bot.ru \
  -e JWT_SECRET=asdfasdfasdfasdf \
  -v $PWD/data:/data \
  --restart unless-stopped \
  maxbot
