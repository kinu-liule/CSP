FROM node:18-alpine

ARG SERVICE_DIR

WORKDIR /app

COPY shared ./shared

COPY ${SERVICE_DIR}/package*.json ./${SERVICE_DIR}/
RUN cd ${SERVICE_DIR} && npm install

COPY ${SERVICE_DIR}/ ./${SERVICE_DIR}/

WORKDIR /app/${SERVICE_DIR}

CMD ["npm", "start"]
