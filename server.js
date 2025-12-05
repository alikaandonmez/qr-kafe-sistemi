const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = 3000;

// --- MIDDLEWARE ---
app.use(express.json());
app.use(cors());

// --- STATIC FILES (DÜZELTME BURADA) ---
// 'public' klasörünü statik olarak sun. 
// Bu sayede http://localhost:3000/admin.html adresine erişilebilir.
app.use(express.static(path.join(__dirname, 'public')));

// (Opsiyonel) Kök dizindeki dosyalar için fallback
app.use(express.static(path.join(__dirname)));

// --- DATABASE PATHS ---
const DB_FOLDER = path.join(__dirname, 'db');
const BACKUP_FOLDER = path.join(__dirname, 'backups');

const TABLES_FILE = path.join(DB_FOLDER, 'tables.json');
const MENU_FILE = path.join(DB_FOLDER, 'menu.json');
const SALES_FILE = path.join(DB_FOLDER, 'sales.json');

// --- INITIALIZATION ---
// Klasörler yoksa oluştur
if (!fs.existsSync(DB_FOLDER)) fs.mkdirSync(DB_FOLDER);
if (!fs.existsSync(BACKUP_FOLDER)) fs.mkdirSync(BACKUP_FOLDER);

// Dosyalar yoksa başlangıç verisiyle oluştur
const initFile = (file, defaultContent) => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultContent, null, 2));
};

initFile(TABLES_FILE, {});
initFile(MENU_FILE, []);
initFile(SALES_FILE, []);

// --- HELPERS ---
const readJson = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return []; // Hata durumunda boş dizi/obje dön
    }
};

const writeJson = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// --- AUTOMATIC BACKUP SERVICE (Every 1 Hour) ---
setInterval(() => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const source = MENU_FILE;
        const dest = path.join(BACKUP_FOLDER, `menu_backup_${timestamp}.json`);
        
        if (fs.existsSync(source)) {
            fs.copyFileSync(source, dest);
            console.log(`[BACKUP] Menu backed up to ${dest}`);
        }
    } catch (err) {
        console.error('[BACKUP FAILED]', err);
    }
}, 3600000); // 1 Saat

// --- ADMIN AUTH ---
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === '1234') {
        res.json({ token: 'admin-secret-token' });
    } else {
        res.status(401).json({ error: 'Hatalı şifre' });
    }
});

// --- MENU API ---
app.get('/api/menu', (req, res) => res.json(readJson(MENU_FILE)));

app.post('/api/add-product', (req, res) => {
    const menu = readJson(MENU_FILE);
    const newProduct = { id: Date.now().toString(), ...req.body };
    menu.push(newProduct);
    writeJson(MENU_FILE, menu);
    res.json({ success: true });
});

app.delete('/api/delete-product/:id', (req, res) => {
    let menu = readJson(MENU_FILE);
    menu = menu.filter(p => p.id !== req.params.id);
    writeJson(MENU_FILE, menu);
    res.json({ success: true });
});

// --- TABLES API ---
app.get('/api/tables', (req, res) => res.json(readJson(TABLES_FILE)));

app.post('/api/confirm', (req, res) => {
    const { tableId, orderId } = req.body;
    const tables = readJson(TABLES_FILE);
    const table = tables[tableId];
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const orderIndex = table.pendingOrders.findIndex(o => o.id === orderId);
    if (orderIndex > -1) {
        const order = table.pendingOrders.splice(orderIndex, 1)[0];
        const existing = table.confirmedOrders.find(o => o.name === order.name);
        if (existing) {
            existing.qty += order.qty;
        } else {
            table.confirmedOrders.push({ ...order, paidQty: 0 });
        }
        writeJson(TABLES_FILE, tables);
    }
    res.json({ success: true });
});

app.post('/api/partial-pay', (req, res) => {
    const { tableId, items } = req.body;
    const tables = readJson(TABLES_FILE);
    const table = tables[tableId];
    
    if (table) {
        items.forEach(payItem => {
            const target = table.confirmedOrders.find(o => o.name === payItem.name);
            if (target) {
                target.paidQty = (target.paidQty || 0) + payItem.qty;
            }
        });
        writeJson(TABLES_FILE, tables);
    }
    res.json({ success: true });
});

// --- CLOSE TABLE & ARCHIVE SALES ---
app.post('/api/close', (req, res) => {
    const { tableId } = req.body;
    
    try {
        // 1. Masaları Oku
        const tables = readJson(TABLES_FILE);
        const tableData = tables[tableId];

        if (tableData) {
            // 2. Satışları Oku (Her zaman güncel dosyayı oku)
            // Eğer dosya boşsa veya bozuksa boş dizi başlat
            let sales = readJson(SALES_FILE);
            if (!Array.isArray(sales)) sales = [];

            // 3. Toplam Tutarı Hesapla
            let totalRevenue = 0;
            if (tableData.confirmedOrders && Array.isArray(tableData.confirmedOrders)) {
                totalRevenue = tableData.confirmedOrders.reduce((sum, item) => {
                    return sum + (Number(item.price) * Number(item.qty));
                }, 0);
            }

            // 4. Arşiv Kaydı Oluştur
            const archiveRecord = {
                id: Date.now().toString(),
                tableId: tableId,
                date: new Date().toISOString(), // UTC formatında sakla, frontend'de yerel saate çevrilecek
                totalAmount: totalRevenue,
                items: tableData.confirmedOrders || []
            };

            // 5. Listeye Ekle ve Kaydet (Append)
            sales.push(archiveRecord);
            writeJson(SALES_FILE, sales);

            // 6. Masayı Sil ve Kaydet
            delete tables[tableId];
            writeJson(TABLES_FILE, tables);
            
            console.log(`[CLOSE] Masa ${tableId} kapatıldı. Ciro: ${totalRevenue} TL. Arşivlendi.`);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error("Masa kapatma hatası:", error);
        res.status(500).json({ error: "İşlem sırasında sunucu hatası oluştu." });
    }
});

// --- REPORTS API ---
app.get('/api/reports', (req, res) => {
    const sales = readJson(SALES_FILE);
    res.json(Array.isArray(sales) ? sales : []);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});