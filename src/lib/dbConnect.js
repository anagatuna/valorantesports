import mongoose from "mongoose";

let cached = global.mongooseConn;
if (!cached) cached = global.mongooseConn = { conn: null, promise: null };

export default async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI no está definido");
    cached.promise = mongoose.connect(uri, {
      // opciones recomendadas
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    }).then(m => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
