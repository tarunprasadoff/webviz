# 1. Use an official Node.js runtime as a parent image
FROM node:16

# 2. Set the working directory
WORKDIR /app

# 3. Copy all files from this folder into the container
COPY . /app

# 4. Expose the port your server runs on
EXPOSE 8000

# 5. By default, run server.js
CMD ["node", "server.js"]