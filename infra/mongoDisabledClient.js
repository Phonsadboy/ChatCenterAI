const { ObjectId } = require("mongodb");

function createEmptyCursor() {
  return {
    sort() {
      return this;
    },
    project() {
      return this;
    },
    limit() {
      return this;
    },
    skip() {
      return this;
    },
    hint() {
      return this;
    },
    allowDiskUse() {
      return this;
    },
    async toArray() {
      return [];
    },
    async next() {
      return null;
    },
    async hasNext() {
      return false;
    },
    async close() {},
    [Symbol.asyncIterator]: async function* asyncIterator() {
      return;
    },
  };
}

function createNoopCollection() {
  return {
    find() {
      return createEmptyCursor();
    },
    aggregate() {
      return createEmptyCursor();
    },
    async findOne() {
      return null;
    },
    async countDocuments() {
      return 0;
    },
    async distinct() {
      return [];
    },
    async insertOne() {
      return {
        acknowledged: true,
        insertedId: new ObjectId(),
      };
    },
    async insertMany(docs = []) {
      const insertedIds = {};
      docs.forEach((_, index) => {
        insertedIds[index] = new ObjectId();
      });
      return {
        acknowledged: true,
        insertedCount: Array.isArray(docs) ? docs.length : 0,
        insertedIds,
      };
    },
    async updateOne() {
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null,
      };
    },
    async updateMany() {
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null,
      };
    },
    async deleteOne() {
      return {
        acknowledged: true,
        deletedCount: 0,
      };
    },
    async deleteMany() {
      return {
        acknowledged: true,
        deletedCount: 0,
      };
    },
    async findOneAndUpdate() {
      return {
        ok: 1,
        value: null,
      };
    },
    async findOneAndDelete() {
      return {
        ok: 1,
        value: null,
      };
    },
    async createIndex() {
      return "noop_index";
    },
    async createIndexes() {
      return [];
    },
    async dropIndex() {
      return undefined;
    },
    async bulkWrite() {
      return {
        acknowledged: true,
        insertedCount: 0,
        matchedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        upsertedCount: 0,
      };
    },
    async rename() {
      return this;
    },
  };
}

function createMongoDisabledClient() {
  return {
    db() {
      return {
        collection() {
          return createNoopCollection();
        },
      };
    },
  };
}

module.exports = {
  createMongoDisabledClient,
};
