import { serve } from "@hono/node-server";
import { Hono } from "hono";
import dotenv from "dotenv";
import { addPoint, createCollection, search, searchByAId } from "./qdrant.js";
import { cors } from 'hono/cors'
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const app = new Hono();

app.use('/*', cors())

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({
    success: false,
    messages: [err.message],
  });
});

const modelMappings = {
  "text-classification": ["@cf/huggingface/distilbert-sst-2-int8"],
  "text-embeddings": ["@cf/baai/bge-base-en-v1.5"],
  "speech-recognition": ["@cf/openai/whisper"],
  "image-classification": ["@cf/microsoft/resnet-50"],
  "text-generation": ["@cf/meta/llama-2-7b-chat-int8"],
  "sentiment-analysis": ["@cf/huggingface/distilbert-sst-2-int8"],
  "embeddings-base": ["@cf/baai/bge-base-en-v1.5"],
  "embeddings-large": ["@cf/baai/bge-large-en-v1.5"],
  "llama": ["@cf/meta/llama-2-7b-chat-int8"],
  "translation": ["@cf/meta/m2m100-1.2b"],
};
const GLOBAL_URL = "https://api.cloudflare.com/client/v4/accounts/";

app.get("/", (c) => c.text("Hello Hono!"));

//speech to text
app.post("/whisper", async (c) => {
  const body = await c.req.json();
  const soundTrackUrl = await body.url;

  const audioResponse = await fetch(soundTrackUrl);
  const blob = await audioResponse.arrayBuffer();

  const apiUrl =
    GLOBAL_URL +
    `${process.env.ACCOUNT_ID}/ai/run/${modelMappings["speech-recognition"][0]}`;
  console.log(apiUrl);
  const speechText = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
    },
    body: blob,
  });
  if (!speechText.ok) {
    console.log("!speechText.ok " + speechText.status);
    throw new Error(
      `Failed to fetch: ${speechText.status} ${speechText.statusText}`
    );
  }
  const resData = await speechText.json();
  return c.json(resData);
});

//sentiment analysis, seems only english
app.post("/sentiment", async (c) => {
  const text = await c.req.json();
  const apiUrl =
    GLOBAL_URL +
    `${process.env.ACCOUNT_ID}/ai/run/${modelMappings["sentiment-analysis"][0]}`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
    },
    body: JSON.stringify(text),
  });
  const resData = await res.json();
  return c.json(resData);
});

// new collection
app.get("/qd/nc", async (c) => {
  const qres = await createCollection(process.env.VECTOR_COLLECTION);
  console.log("qres: " + qres);
  return c.json({ qres });
});

// add point which contains vector
app.post("/qd/ap", async (c) => {
  const { text } = await c.req.json();
  const cfEmb = await getEmbeddings(c, text);
  const vec = cfEmb.result.data[0];
  const point = [
    {
      id: uuidv4(),
      vector: vec,
      payload: {
        text: text,
      },
    },
  ];
  const qres = await addPoint(process.env.VECTOR_COLLECTION, point);
  console.log("qres: " + qres);
  return c.json({ qres });
});

app.post("/qd/ap/t", async (c) => {
  const qres = await createCollection(process.env.VECTOR_COLLECTION);
  if (qres == false) {
    throw new Error(`failed to create new collection`);
  }
  const text = await c.req.text();
  const textArr = text.split("\r\n\r\n");
  const aid = uuidv4();
  for (const i in textArr) {
    const cfEmb = await getEmbeddings(c, textArr[i]);
    console.log(cfEmb.success);
    if (cfEmb.success === false) {
      throw new Error(
        `failed to generate embeddings, err: ${JSON.stringify(cfEmb.errors)}`
      );
    }
    const vec = cfEmb.result.data[0];
    console.log(vec.length);
    const point = [
      {
        id: uuidv4(),
        vector: vec,
        payload: {
          text: textArr[i],
          aid: aid,
        },
      },
    ];
    const qres = await addPoint(process.env.VECTOR_COLLECTION, point);
    console.log("qres: " + qres);
  }
  return c.json({ aid });
});

app.post("/qd/sch", async (c) => {
  const { text, aid } = await c.req.json();
  if (aid == null || aid === "") {
    throw new Error(`aid can not be null or empty`);
  }
  const cfEmb = await getEmbeddings(c, text);
  const vec = cfEmb.result.data[0];
  console.log(vec.length);
  // const res = await search(process.env.VECTOR_COLLECTION, vec);
  const res = await searchByAId(process.env.VECTOR_COLLECTION, vec, aid);

  console.log(JSON.stringify(res));
  if (res.length == 0) {
    throw new Error(`aid not exist`);
  }

  const notes = res.map((r) => r.payload.text);
  // console.log(JSON.stringify(notes))
  const llama_res = await llama_assist(c, notes, text);
  return c.json(llama_res);
});

//embeddings
async function getEmbeddings(c, text) {
  const apiUrl =
    GLOBAL_URL +
    `${process.env.ACCOUNT_ID}/ai/run/${modelMappings["embeddings-base"][0]}`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
    },
    body: JSON.stringify({
      text: text,
    }),
  });
  const resData = await res.json();
  return resData;
}

async function llama_assist(c, notes, question) {
  const apiUrl =
    GLOBAL_URL +
    `${process.env.ACCOUNT_ID}/ai/run/${modelMappings["llama"][0]}`;
  const contextMessage = notes.length
    ? `Context:\n${notes.map((note) => `- ${note}`).join("\n")}`
    : "";
  const systemPrompt = `When answering the question or responding, use the context provided, if it is provided and relevant.`;

  const payload = {
    messages: [
      ...(notes.length ? [{ role: "system", content: contextMessage }] : []),
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
  };

  console.log("payload: " + JSON.stringify(payload));

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  const resData = await res.json();
  console.log("llama_assist: " + JSON.stringify(resData));
  return resData;
}

console.log("server start at:  http://localhost:8787");
serve({
  fetch: app.fetch,
  port: 8787,
});

export default app;
