import mongoose from 'mongoose';

const uri = 'mongodb+srv://anagatuna:Chispi_014@valorantesports.oybnrmr.mongodb.net/valorantesports?retryWrites=true&w=majority';

mongoose.connect(uri)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    mongoose.disconnect();
  })
  .catch((err) => {
    console.error('❌ Error al conectar:', err);
  });
