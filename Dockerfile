# แทนด้วยแอปจริงของคุณ — platform จะ build+deploy ตาม EXPOSE port
# (ตอนนี้เป็น placeholder nginx port 80)
FROM nginx:alpine
EXPOSE 80
RUN printf '<h1>deployed via OpenDurian Platform</h1>' > /usr/share/nginx/html/index.html \
 && printf 'ok' > /usr/share/nginx/html/health
