import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";

dotenv.config();
const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_APIKEY,
});

export async function createCollection(collectionName) {
  const response = await client.getCollections();

  const collectionNames = response.collections.map(
    (collection) => collection.name
  );

  if (collectionNames.includes(collectionName)) {
    return true;
    // await client.deleteCollection(collectionName);
  }

  const res = await client.createCollection(collectionName, {
    vectors: {
      size: 768,
      distance: "Dot",
    },
    optimizers_config: {
      default_segment_number: 2,
    },
    replication_factor: 2,
  });
  return res;
}

// -------- add point(including vector and payload to qdrant) ----------------
export async function addPoint(collectionName, point) {
  const res = await client.upsert(collectionName, {
    wait: true,
    points: point,
  });
  return res;
}

// -------- Search ----------------
export async function search(collectionName, queryVector) {
  const res = await client.search(collectionName, {
    vector: queryVector,
    limit: 2,
  });
  return res;
}

export async function searchByAId(collectionName, queryVector, aid) {
  const res = await client.search(collectionName, {
    vector: queryVector,
    limit: 2,
    filter: {
      must: [
        {
          key: "aid",
          match: {
            value: aid,
          },
        },
      ],
    },
  });
  return res;
}
