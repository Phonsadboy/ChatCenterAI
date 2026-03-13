class MongoRuntimeDisabledError extends Error {
  constructor(target = "MongoDB") {
    super(
      `MongoDB runtime is disabled, but code attempted to access ${target}. Migrate this path to PostgreSQL before cutover.`,
    );
    this.name = "MongoRuntimeDisabledError";
    this.code = "MONGO_RUNTIME_DISABLED";
  }
}

function createThrower(target) {
  return () => {
    throw new MongoRuntimeDisabledError(target);
  };
}

function createMongoDisabledCollection(collectionName = "unknown_collection") {
  const methodProxy = new Proxy(
    {},
    {
      get(_, methodName) {
        if (methodName === Symbol.toStringTag) {
          return "MongoDisabledCollection";
        }
        return createThrower(
          `MongoDB collection "${collectionName}" via ${String(methodName)}()`,
        );
      },
    },
  );
  return methodProxy;
}

function createMongoDisabledDb(dbName = "unknown_db") {
  const dbProxy = new Proxy(
    {},
    {
      get(_, propertyName) {
        if (propertyName === "collection") {
          return (collectionName) =>
            createMongoDisabledCollection(collectionName || "unknown_collection");
        }
        if (propertyName === Symbol.toStringTag) {
          return "MongoDisabledDb";
        }
        return createThrower(`MongoDB database "${dbName}" property ${String(propertyName)}`);
      },
    },
  );
  return dbProxy;
}

function createMongoDisabledClient() {
  return new Proxy(
    {},
    {
      get(_, propertyName) {
        if (propertyName === "db") {
          return (dbName) => createMongoDisabledDb(dbName || "unknown_db");
        }
        if (propertyName === "collection") {
          return (collectionName) =>
            createMongoDisabledCollection(collectionName || "unknown_collection");
        }
        if (propertyName === Symbol.toStringTag) {
          return "MongoDisabledClient";
        }
        return createThrower(`MongoDB client property ${String(propertyName)}`);
      },
    },
  );
}

module.exports = {
  MongoRuntimeDisabledError,
  createMongoDisabledClient,
};
