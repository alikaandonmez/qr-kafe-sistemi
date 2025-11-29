const express = require("express");
const app = express();

// 🔴 Render PORT'u buradan verir
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static("public"));
app.use(express.json());

const tables = {};

// Sipariş alma
app.post("/api/order", (req, res) => {
  const { tableId, items } = req.body;
  if (!tableId || !items || !items.length) {
    return res.status(400).json({ error: "Geçersiz sipariş" });
  }

  // Masa kaydı yoksa oluştur
  if (!tables[tableId]) {
    tables[tableId] = {
      pendingOrders: [],
      confirmedOrders: []
    };
  }

  // 🔹 ÖNEMLİ DEĞİŞİKLİK:
  // Eskiden: bütün ürünler tek "items" dizisi olarak ekleniyordu
  // Şimdi: her ürünü tek tek pendingOrders içine yazıyoruz
  items.forEach(item => {
    tables[tableId].pendingOrders.push({
      id: Date.now() + Math.random(), // ✅ BENZERSİZ ID
      name: item.name,
      qty: item.qty,
      price: item.price,
      time: Date.now()
    });
  });  

  res.sendStatus(200);
});


// ✅ Sipariş ONAYLAMA
// ✅ Sipariş ONAYLAMA (ID ile)
app.post("/api/confirm", (req, res) => {
  const { tableId, orderId } = req.body;

  if (!tableId || !orderId || !tables[tableId]) {
    return res.sendStatus(400);
  }

  const index = tables[tableId].pendingOrders.findIndex(
    o => o.id === orderId
  );

  if (index === -1) {
    return res.sendStatus(404);
  }

  const order = tables[tableId].pendingOrders.splice(index, 1)[0];
  tables[tableId].confirmedOrders.push(order);

  res.sendStatus(200);
});


app.post("/api/unconfirm", (req, res) => {
  const { tableId, orderIndex } = req.body;

  if (
    !tableId ||
    orderIndex === undefined ||
    !tables[tableId]
  ) {
    return res.sendStatus(400);
  }

  const order = tables[tableId].confirmedOrders.splice(orderIndex, 1)[0];
  if (!order) {
    return res.sendStatus(404);
  }

  tables[tableId].pendingOrders.push(order);

  res.sendStatus(200);
});


// Admin – tüm masalar
app.get("/api/tables", (req, res) => {
  res.json(tables);
});

// ✅ Masa hesabı kapatma
app.post("/api/close", (req, res) => {
  const { tableId } = req.body;
  if (!tableId || !tables[tableId]) {
    return res.sendStatus(400);
  }

  delete tables[tableId];
  res.sendStatus(200);
});

// ✅ MUTLAKA 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port:", PORT);
});
