// Основной скрипт админ-панели RAYGAME

let adminToken = null;
let currentAdmin = null;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth();
    loadDashboardStats();
    
    // Проверяем токен каждые 5 минут
    setInterval(checkAdminAuth, 300000);
});

// Проверка авторизации админа
async function checkAdminAuth() {
    adminToken = localStorage.getItem('raygame_admin_token');
    
    if (!adminToken) {
        // Если нет токена, редирект на страницу входа
        window.location.href = '/admin-login.html';
        return;
    }

    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            localStorage.removeItem('raygame_admin_token');
            window.location.href = '/admin-login.html';
            return;
        }

        const data = await response.json();
        
        if (data.user.role !== 'admin') {
            showNotification('Требуются права администратора', 'error');
            logout();
            return;
        }

        currentAdmin = data.user;
        document.title = `RAYGAME Admin | ${currentAdmin.username}`;
        
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('raygame_admin_token');
        window.location.href = '/admin-login.html';
    }
}

// Загрузка статистики дашборда
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load stats');
        }

        const data = await response.json();

        // Обновляем статистику
        document.getElementById('statTotalUsers').textContent = data.totalUsers.toLocaleString();
        document.getElementById('statTotalBalance').textContent = `$${data.totalBalance.toFixed(2)}`;
        document.getElementById('statTodayProfit').textContent = `$${data.todayProfit.toFixed(2)}`;
        document.getElementById('statActiveGames').textContent = data.activeGames.toLocaleString();

        // Обновляем бейджи
        document.getElementById('usersCount').textContent = data.totalUsers;
        document.getElementById('pendingCount').textContent = '0'; // Здесь нужно получать реальные данные

        // Загружаем последние транзакции
        await loadRecentTransactions();
        
        // Загружаем топ пользователей
        await loadTopUsers();

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showNotification('Ошибка загрузки статистики', 'error');
    }
}

// Загрузка последних транзакций
async function loadRecentTransactions() {
    try {
        const response = await fetch('/api/admin/transactions?limit=10', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load transactions');
        }

        const data = await response.json();
        const container = document.getElementById('recentTransactions');
        
        if (!container) return;

        container.innerHTML = data.transactions.map(tx => `
            <div class="table-row">
                <div>${tx.id}</div>
                <div>${tx.username || 'N/A'}</div>
                <div>${getTransactionTypeLabel(tx.type)}</div>
                <div class="${tx.type.includes('win') || tx.type === 'admin_add' ? 'text-success' : 'text-danger'}">
                    $${parseFloat(tx.amount).toFixed(2)}
                </div>
                <div>
                    <span class="status-badge status-${tx.status}">
                        ${getStatusLabel(tx.status)}
                    </span>
                </div>
                <div>${new Date(tx.created_at).toLocaleString()}</div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Загрузка топ пользователей
async function loadTopUsers() {
    try {
        // Ищем пользователей с самым высоким балансом
        const response = await fetch('/api/admin/users/search?query=&limit=10', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load top users');
        }

        const data = await response.json();
        const container = document.getElementById('topUsers');
        
        if (!container) return;

        // Сортируем по балансу
        const sortedUsers = data.users.sort((a, b) => b.balance - a.balance);
        
        container.innerHTML = sortedUsers.map((user, index) => `
            <div class="table-row">
                <div>${index + 1}</div>
                <div>
                    <strong>${user.username}</strong><br>
                    <small>ID: ${user.id}</small>
                </div>
                <div class="text-success">$${parseFloat(user.balance).toFixed(2)}</div>
                <div>$${parseFloat(user.total_deposited || 0).toFixed(2)}</div>
                <div>$${parseFloat(user.total_won || 0).toFixed(2)}</div>
                <div>
                    <button class="admin-btn btn-primary btn-sm" onclick="viewUser(${user.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="admin-btn btn-success btn-sm" onclick="addMoneyToUser(${user.id}, '${user.username}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading top users:', error);
    }
}

// Показать раздел
function showSection(sectionId) {
    // Скрываем все разделы
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Показываем выбранный раздел
    document.getElementById(sectionId)?.classList.remove('hidden');
    
    // Обновляем активную кнопку в навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    document.querySelector(`.nav-item[onclick*="${sectionId}"]`)?.classList.add('active');
    
    // Загружаем данные раздела
    switch(sectionId) {
        case 'dashboard':
            loadDashboardStats();
            break;
        case 'users':
            loadUsers();
            break;
        case 'withdrawals':
            loadWithdrawals();
            break;
        case 'transactions':
            loadAllTransactions();
            break;
    }
}

// Поиск пользователей
let searchTimeout;
function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(searchUser, 500);
}

async function searchUser() {
    const query = document.getElementById('userSearch').value;
    
    try {
        const response = await fetch(`/api/admin/users/search?query=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Search failed');
        }

        const data = await response.json();
        displayUsers(data.users);

    } catch (error) {
        console.error('Search error:', error);
        showNotification('Ошибка поиска', 'error');
    }
}

// Отображение пользователей
function displayUsers(users) {
    const container = document.getElementById('usersList');
    
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = `
            <div class="table-row">
                <div colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-user-slash" style="font-size: 2rem; color: #666; margin-bottom: 10px;"></i>
                    <div>Пользователи не найдены</div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="table-row">
            <div>${user.id}</div>
            <div>
                <strong>${user.username}</strong><br>
                <small>${user.email}</small>
            </div>
            <div>${user.email}</div>
            <div class="${user.balance > 0 ? 'text-success' : 'text-warning'}">
                $${parseFloat(user.balance).toFixed(2)}
            </div>
            <div>
                <span class="status-badge ${user.role === 'admin' ? 'bg-primary' : 'bg-success'}">
                    ${user.role}
                </span>
            </div>
            <div>
                <span class="status-badge ${user.is_banned ? 'status-failed' : 'status-completed'}">
                    ${user.is_banned ? 'Забанен' : 'Активен'}
                </span>
            </div>
            <div>
                <button class="admin-btn btn-primary btn-sm" onclick="viewUser(${user.id})" title="Просмотр">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="admin-btn btn-success btn-sm" onclick="addMoneyToUser(${user.id}, '${user.username}')" title="Выдать деньги">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="admin-btn btn-danger btn-sm" onclick="${user.is_banned ? 'unbanUser' : 'banUser'}(${user.id})" title="${user.is_banned ? 'Разбанить' : 'Забанить'}">
                    <i class="fas fa-${user.is_banned ? 'lock-open' : 'lock'}"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Выдать деньги пользователю
function addMoneyToUser(userId, username) {
    document.getElementById('addMoneyUserId').value = userId;
    document.getElementById('addMoneyAmount').value = '';
    document.getElementById('addMoneyReason').value = '';
    
    showModal('addMoneyModal');
}

// Обработка выдачи денег
async function processAddMoney() {
    const userId = document.getElementById('addMoneyUserId').value;
    const amount = parseFloat(document.getElementById('addMoneyAmount').value);
    const reason = document.getElementById('addMoneyReason').value;

    if (!userId || !amount || amount <= 0) {
        showNotification('Введите корректные данные', 'error');
        return;
    }

    try {
        const response = await fetch('/api/admin/users/add-money', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                userId: parseInt(userId),
                amount: amount,
                reason: reason
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(data.message, 'success');
            closeModal('addMoneyModal');
            loadDashboardStats();
            
            // Обновляем список пользователей если он открыт
            if (!document.getElementById('users').classList.contains('hidden')) {
                searchUser();
            }
        } else {
            showNotification(data.error || 'Ошибка', 'error');
        }

    } catch (error) {
        console.error('Add money error:', error);
        showNotification('Ошибка сети', 'error');
    }
}

// Просмотр пользователя
function viewUser(userId) {
    // Здесь можно открыть модальное окно с детальной информацией о пользователе
    // или перейти на отдельную страницу
    showNotification(`Просмотр пользователя ID: ${userId}`, 'info');
    // В реальном проекте здесь будет загрузка полной информации о пользователе
}

// Бан пользователя
async function banUser(userId) {
    if (!confirm('Вы уверены, что хотите забанить этого пользователя?')) {
        return;
    }

    const reason = prompt('Укажите причину бана:', 'Нарушение правил');

    try {
        const response = await fetch('/api/admin/users/ban', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                userId: parseInt(userId),
                reason: reason
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(data.message, 'success');
            searchUser(); // Обновляем список
        } else {
            showNotification(data.error || 'Ошибка', 'error');
        }

    } catch (error) {
        console.error('Ban user error:', error);
        showNotification('Ошибка сети', 'error');
    }
}

// Разбан пользователя
async function unbanUser(userId) {
    try {
        const response = await fetch('/api/admin/users/unban', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ userId: parseInt(userId) })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(data.message, 'success');
            searchUser(); // Обновляем список
        } else {
            showNotification(data.error || 'Ошибка', 'error');
        }

    } catch (error) {
        console.error('Unban user error:', error);
        showNotification('Ошибка сети', 'error');
    }
}

// Загрузка всех пользователей
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users/search?query=', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load users');
        }

        const data = await response.json();
        displayUsers(data.users);

    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Ошибка загрузки пользователей', 'error');
    }
}

// Загрузка выводов
async function loadWithdrawals() {
    try {
        const response = await fetch('/api/admin/pending-withdraws', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load withdrawals');
        }

        const data = await response.json();
        displayWithdrawals(data.withdraws);

        // Обновляем статистику
        if (data.stats) {
            document.getElementById('statPendingWithdrawals').textContent = data.stats.total_pending;
            document.getElementById('withdrawalsCount').textContent = data.stats.total_pending;
            document.getElementById('statTotalWithdrawAmount').textContent = `$${parseFloat(data.stats.total_amount || 0).toFixed(2)}`;
        }

    } catch (error) {
        console.error('Error loading withdrawals:', error);
        showNotification('Ошибка загрузки выводов', 'error');
    }
}

// Отображение выводов
function displayWithdrawals(withdraws) {
    const container = document.getElementById('withdrawalsList');
    
    if (!container) return;

    if (withdraws.length === 0) {
        container.innerHTML = `
            <div class="table-row">
                <div colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-check-circle" style="font-size: 2rem; color: #00cc66; margin-bottom: 10px;"></i>
                    <div>Нет ожидающих выводов</div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = withdraws.map(wd => {
        // Извлекаем метод и реквизиты из описания
        const desc = wd.description || '';
        const method = desc.includes('на') ? desc.split('на')[1]?.split(':')[0]?.trim() || 'Не указан' : 'Не указан';
        const wallet = desc.split(':')[1]?.trim() || 'Не указан';

        return `
            <div class="table-row">
                <div>${wd.id}</div>
                <div>
                    <strong>${wd.username}</strong><br>
                    <small>${wd.email}</small>
                </div>
                <div class="text-danger">
                    <strong>$${parseFloat(wd.amount).toFixed(2)}</strong><br>
                    <small>${wd.currency}</small>
                </div>
                <div>${method}</div>
                <div>
                    <code title="${wallet}">${wallet.substring(0, 20)}${wallet.length > 20 ? '...' : ''}</code>
                </div>
                <div>${new Date(wd.created_at).toLocaleString()}</div>
                <div>
                    <button class="admin-btn btn-success btn-sm" onclick="approveWithdrawal(${wd.id})" title="Подтвердить">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="admin-btn btn-danger btn-sm" onclick="rejectWithdrawal(${wd.id})" title="Отклонить">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="admin-btn btn-primary btn-sm" onclick="viewWithdrawal(${wd.id})" title="Подробнее">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Подтверждение вывода
async function approveWithdrawal(transactionId) {
    if (!confirm('Подтвердить вывод средств?')) {
        return;
    }

    try {
        const response = await fetch('/api/payment/admin/approve-withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ transactionId })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(data.message, 'success');
            loadWithdrawals(); // Обновляем список
        } else {
            showNotification(data.error || 'Ошибка', 'error');
        }

    } catch (error) {
        console.error('Approve withdrawal error:', error);
        showNotification('Ошибка сети', 'error');
    }
}

// Отклонение вывода
async function rejectWithdrawal(transactionId) {
    const reason = prompt('Укажите причину отклонения:', 'Нарушение правил');

    if (!reason) {
        return;
    }

    try {
        const response = await fetch('/api/payment/admin/reject-withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ transactionId, reason })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(data.message, 'success');
            loadWithdrawals(); // Обновляем список
        } else {
            showNotification(data.error || 'Ошибка', 'error');
        }

    } catch (error) {
        console.error('Reject withdrawal error:', error);
        showNotification('Ошибка сети', 'error');
    }
}

// Просмотр вывода
function viewWithdrawal(transactionId) {
    // Здесь можно показать детальную информацию о выводе
    showNotification(`Просмотр вывода ID: ${transactionId}`, 'info');
}

// Утилиты
function getTransactionTypeLabel(type) {
    const labels = {
        'deposit': 'Депозит',
        'withdraw': 'Вывод',
        'game_bet': 'Ставка',
        'game_win': 'Выигрыш',
        'admin_add': 'Админ добавление',
        'admin_remove': 'Админ списание',
        'bonus': 'Бонус',
        'refund': 'Возврат'
    };
    
    return labels[type] || type;
}

function getStatusLabel(status) {
    const labels = {
        'pending': 'Ожидание',
        'completed': 'Выполнено',
        'failed': 'Ошибка',
        'cancelled': 'Отменено'
    };
    
    return labels[status] || status;
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showNotification(message, type = 'info') {
    // Удаляем старые уведомления
    const oldNotifications = document.querySelectorAll('.notification');
    oldNotifications.forEach(n => n.remove());

    // Создаем новое уведомление
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                ${message}
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; margin-left: 15px;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    document.body.appendChild(notification);

    // Автоматическое скрытие
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Обновление статистики
function refreshStats() {
    showNotification('Обновление статистики...', 'info');
    loadDashboardStats();
}

// Экспорт данных
function exportData() {
    showNotification('Экспорт данных в разработке', 'info');
}

// Выход
function logout() {
    localStorage.removeItem('raygame_admin_token');
    window.location.href = '/';
}

// Стили для маленьких кнопок
const style = document.createElement('style');
style.textContent = `
    .btn-sm {
        padding: 5px 10px !important;
        font-size: 12px !important;
        min-width: auto !important;
    }
    
    .status-pending { background: rgba(255, 204, 0, 0.2); color: #ffcc00; }
    .status-completed { background: rgba(0, 204, 102, 0.2); color: #00cc66; }
    .status-failed { background: rgba(255, 51, 102, 0.2); color: #ff3366; }
    .status-cancelled { background: rgba(153, 153, 153, 0.2); color: #999; }
`;
document.head.appendChild(style);