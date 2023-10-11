## Getting Started
Retrieval Augmented Generation (RAG) AI


an api server interact with vector database(qdrant) and cloudflare workers ai.
it's a backend server for [click here](https://github.com/Sobev/compre-lamp)
it's using Cloudflare Workers AI Restful Api to generate response

example
![](https://i.imgur.com/qYg06nL.png)
[more details](https://github.com/Sobev/compre-lamp)

## How to Use

```bash
docker pull qdrant/qdrant
docker run -p 6333:6333 qdrant/qdrant
```

copy .env.example to .env, and fill those value

```bash
ACCOUNT_ID = "" #cloudflare account id
API_TOKEN = "" # cloudflare api token
VECTOR_COLLECTION = "" # qdrant database name
QDRANT_URL = "http://127.0.0.1:6333" # database url
QDRANT_APIKEY = "" # database apikey
```

```
npm install
npm run start
```