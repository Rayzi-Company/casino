const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Временное хранилище в памяти
let users = [
    {
        id: 1,
        username: 'rayadmin',
        email: 'admin@raygame.com',
        password: '$2b$10$K7g/7zmQaP.t8Q5Vp2CbK.2XjZC5pN3V6kZ1YJt8qLmNvH1dS4rW6', // admin123
        balance: 1000.00,
        role: 'admin'
    }
];

let transactions = [];
let gameHistory = [];

// Создаем директории если их нет
const dirs = ['../frontend/css', '../frontend/js', '../frontend/images', '../admin-panel'];
dirs.forEach(dir => {
    if (!fs.existsSync(path.join(__dirname, dir))) {
        fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
    }
});

// API endpoints
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (users.find(u => u.username === username || u.email === email)) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    
    const newUser = {
        id: users.length + 1,
        username,
        email,
        password, // В реальном проекте хешируйте пароль!
        balance: 10.00, // Стартовый бонус
        role: 'user'
    };
    
    users.push(newUser);
    
    res.json({
        success: true,
        user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            balance: newUser.balance,
            role: newUser.role
        }
    });
});

app.post('/api/auth/login', (req, res) => {
    const { login, password } = req.body;
    
    const user = users.find(u => 
        (u.username === login || u.email === login) && 
        u.password === password // В реальном проекте проверяйте хеш!
    );
    
    if (!user) {
        return res.status(401).json({ error: 'Неверные данные' });
    }
    
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            balance: user.balance,
            role: user.role
        },
        token: 'demo-token-' + user.id
    });
});

app.get('/api/games', (req, res) => {
    const games = [
        {
            id: 'slots',
            name: 'RAY Slots',
            description: 'Классические слоты с джекпотом',
            icon: 'fas fa-slot-machine',
            min_bet: 0.10,
            max_bet: 1000,
            rtp: 96.5
        },
        {
            id: 'dice',
            name: 'RAY Dice',
            description: 'Бросок костей на удачу',
            icon: 'fas fa-dice',
            min_bet: 0.50,
            max_bet: 500,
            rtp: 97.0
        },
        {
            id: 'crash',
            name: 'RAY Crash',
            description: 'Успей вывести до краша',
            icon: 'fas fa-rocket',
            min_bet: 1.00,
            max_bet: 10000,
            rtp: 95.0
        }
    ];
    
    res.json(games);
});

app.post('/api/games/play/slots', (req, res) => {
    const { userId, bet } = req.body;
    
    const user = users.find(u => u.id === userId);
    if (!user || user.balance < bet) {
        return res.status(400).json({ error: 'Недостаточно средств' });
    }
    
    // Симуляция игры
    const symbols = ['🍒', '🍋', '🍊', '⭐', '🔔', '7️⃣'];
    const result = [
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)]
    ];
    
    let winMultiplier = 0;
    if (result[0] === '7️⃣' && result[1] === '7️⃣' && result[2] === '7️⃣') {
        winMultiplier = 100;
    } else if (result[0] === result[1] && result[1] === result[2]) {
        winMultiplier = 10;
    } else if (result[0] === result[1] || result[1] === result[2]) {
        winMultiplier = 2;
    }
    
    const winAmount = bet * winMultiplier;
    user.balance = user.balance - bet + winAmount;
    
    // Записываем историю
    gameHistory.push({
        user_id: userId,
        game_type: 'slots',
        bet_amount: bet,
        win_amount: winAmount,
        result: result.join(' '),
        created_at: new Date()
    });
    
    res.json({
        success: true,
        result,
        bet,
        win: winAmount,
        newBalance: user.balance,
        message: winAmount > 0 ? `🎉 Выигрыш $${winAmount}!` : 'Повезет в следующий раз!'
    });
});

app.post('/api/admin/users/add-money', (req, res) => {
    const { userId, amount } = req.body;
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    user.balance += amount;
    
    transactions.push({
        user_id: userId,
        type: 'admin_add',
        amount: amount,
        description: 'Админское пополнение',
        created_at: new Date()
    });
    
    res.json({
        success: true,
        message: `✅ Выдано $${amount} пользователю ${user.username}`,
        newBalance: user.balance
    });
});

app.get('/api/admin/stats', (req, res) => {
    res.json({
        totalUsers: users.length,
        totalBalance: users.reduce((sum, user) => sum + user.balance, 0),
        todayProfit: Math.random() * 1000,
        activeGames: Math.floor(Math.random() * 50) + 10
    });
});

// Статические файлы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin-panel/index.html'));
});

// Запуск сервера
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════╗
    ║      🎮 RAYGAME SERVER       ║
    ║     Запущен на порту ${PORT}     ║
    ║   http://localhost:${PORT}    ║
    ╚══════════════════════════════╝
    `);
    console.log('Админ-панель: http://localhost:' + PORT + '/admin-panel');
    console.log('Демо пользователь:');
    console.log('  Логин: rayadmin');
    console.log('  Пароль: admin123');
});