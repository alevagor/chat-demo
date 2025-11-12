// Конфигурация - динамическое определение URL
function getConfig() {
	// Проверяем параметры URL
	const urlParams = new URLSearchParams(window.location.search);
	const apiUrl = urlParams.get('apiUrl') || urlParams.get('server');

	// Проверяем переменные окружения (для GitHub Pages можно задать через window)
	const envApiUrl = window.API_URL || window.SERVER_URL;

	// Используем параметр URL, переменную окружения или значение по умолчанию
	const baseUrl = apiUrl || envApiUrl || 'http://medprof.twc1.net:3003';

	// Убираем trailing slash и протокол для WebSocket
	const wsUrl = baseUrl.replace(/\/$/, '');
	const apiBaseUrl = `${wsUrl}/api/support`;

	return {
		API_BASE_URL: apiBaseUrl,
		WS_URL: wsUrl,
	};
}

const config = getConfig();
const API_BASE_URL = config.API_BASE_URL;
const WS_URL = config.WS_URL;

// Логируем используемую конфигурацию
console.log('🔧 Конфигурация подключения:');
console.log(`   API URL: ${API_BASE_URL}`);
console.log(`   WebSocket URL: ${WS_URL}`);

let socket1 = null;
let socket2 = null;
let currentTicketId = null;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
	// Отображаем текущий URL сервера
	const serverUrlEl = document.getElementById('serverUrl');
	if (serverUrlEl) {
		serverUrlEl.textContent = WS_URL;
		serverUrlEl.title = `API: ${API_BASE_URL}\nWebSocket: ${WS_URL}`;
	}

	const ticketIdInput = document.getElementById('ticketId');
	const connectBtn = document.getElementById('connectBtn');
	const messageForm1 = document.getElementById('messageForm1');
	const messageForm2 = document.getElementById('messageForm2');
	const createTicketBtn = document.getElementById('createTicketBtn');
	const refreshBtn = document.getElementById('refreshBtn');

	// Подключение к тикету
	connectBtn.addEventListener('click', () => {
		const ticketId = ticketIdInput.value.trim();
		if (!ticketId) {
			alert('Введите ID тикета');
			return;
		}
		connectToTicket(ticketId);
	});

	// Отправка сообщения от пользователя 1
	messageForm1.addEventListener('submit', (e) => {
		e.preventDefault();
		const input = document.getElementById('messageInput1');
		const content = input.value.trim();
		const userId = document.getElementById('userId1').value.trim();
		const senderType = document.getElementById('senderType1').value;

		if (!content) return;
		if (!currentTicketId) {
			alert('Сначала подключитесь к тикету');
			return;
		}
		if (!userId) {
			alert('Введите User ID для пользователя 1');
			return;
		}

		sendMessage(socket1, content, userId, senderType, 1);
		input.value = '';
	});

	// Отправка сообщения от пользователя 2
	messageForm2.addEventListener('submit', (e) => {
		e.preventDefault();
		const input = document.getElementById('messageInput2');
		const content = input.value.trim();
		const userId = document.getElementById('userId2').value.trim();
		const senderType = document.getElementById('senderType2').value;

		if (!content) return;
		if (!currentTicketId) {
			alert('Сначала подключитесь к тикету');
			return;
		}
		if (!userId) {
			alert('Введите User ID для пользователя 2');
			return;
		}

		sendMessage(socket2, content, userId, senderType, 2);
		input.value = '';
	});

	// Создание нового тикета
	createTicketBtn.addEventListener('click', async () => {
		await createTicket();
	});

	// Обновление информации о тикете
	refreshBtn.addEventListener('click', async () => {
		if (currentTicketId) {
			await loadTicketInfo(currentTicketId);
		}
	});
});

// Проверка доступности сервера
async function checkServerAvailability() {
	// Проверяем mixed content (HTTPS страница → HTTP API)
	const isHttpsPage = window.location.protocol === 'https:';
	const isHttpApi = WS_URL.startsWith('http://');

	if (isHttpsPage && isHttpApi) {
		console.warn(
			'⚠️ Mixed Content: HTTPS страница пытается подключиться к HTTP API'
		);
		console.warn(
			'   Браузер может блокировать запросы. WebSocket подключение может работать.'
		);
	}

	try {
		// Проверяем доступность сервера через HTTP API
		const testUrl = `${WS_URL}/api/support`;
		console.log(`🔍 Проверка доступности сервера: ${testUrl}`);

		// Пробуем простой GET запрос
		const response = await fetch(testUrl, {
			method: 'GET',
			mode: 'cors',
			headers: {
				Accept: 'application/json',
			},
		});

		// Если получили ответ (даже с ошибкой), сервер доступен
		console.log('✅ Сервер доступен (HTTP статус:', response.status, ')');
		return true;
	} catch (error) {
		console.warn('⚠️ Server availability check failed:', error);

		// Проверяем тип ошибки
		const errorMsg = error.message || error.toString();

		// Mixed content ошибка
		if (
			errorMsg.includes('Mixed Content') ||
			errorMsg.includes('mixed content') ||
			errorMsg.includes('blocked:mixed-content')
		) {
			console.warn(
				'⚠️ Mixed Content блокировка: HTTPS страница не может подключиться к HTTP API'
			);
			console.warn(
				'   Попробуем WebSocket подключение (может работать, если сервер поддерживает)'
			);
			return true; // Продолжаем попытку WebSocket подключения
		}

		// Если это CORS ошибка, сервер может быть доступен, но блокировать запросы
		if (errorMsg.includes('CORS') || errorMsg.includes('cors')) {
			console.log(
				'⚠️ CORS ошибка, но сервер может быть доступен для WebSocket'
			);
			// Продолжаем попытку подключения, так как WebSocket может работать
			return true;
		}

		// Для других ошибок пробуем еще раз с no-cors
		try {
			const testUrl = `${WS_URL}/api/support`;
			await fetch(testUrl, {
				method: 'HEAD',
				mode: 'no-cors',
			});
			console.log('✅ Сервер доступен (через no-cors)');
			return true;
		} catch (e) {
			console.warn('⚠️ No-cors request also failed:', e);
		}

		// Если все проверки не удались, но это может быть просто CORS/mixed content проблема
		// Позволяем попытку подключения через WebSocket
		console.log(
			'⚠️ HTTP проверка не удалась, но попробуем WebSocket подключение'
		);
		return true; // Возвращаем true, чтобы попробовать WebSocket подключение
	}
}

// Подключение к тикету через WebSocket
async function connectToTicket(ticketId) {
	// Отключаемся от предыдущих подключений
	if (socket1) {
		socket1.disconnect();
		socket1 = null;
	}
	if (socket2) {
		socket2.disconnect();
		socket2 = null;
	}

	currentTicketId = ticketId;

	updateConnectionStatus('Проверка сервера...', 'connecting');
	const serverAvailable = await checkServerAvailability();
	if (!serverAvailable) {
		updateConnectionStatus(
			'Сервер недоступен. Проверьте, запущен ли сервер на ' + WS_URL,
			'error'
		);
		console.error('❌ Сервер недоступен на ' + WS_URL);
		console.error('💡 Убедитесь, что сервер запущен: pnpm start:dev');
		return;
	}

	updateConnectionStatus('Подключение...', 'connecting');
	console.log(`🔌 Подключение к WebSocket namespace: ${WS_URL}/support`);
	console.log(`   Socket.io path: /socket.io`);

	// Подключаем первого пользователя
	const userId1 = document.getElementById('userId1').value.trim() || 'user1';
	socket1 = await createSocketConnection(ticketId, userId1, 1);

	// Подключаем второго пользователя
	const userId2 = document.getElementById('userId2').value.trim() || 'agent1';
	socket2 = await createSocketConnection(ticketId, userId2, 2);

	// Загружаем информацию о тикете
	loadTicketInfo(ticketId);
}

// Создание WebSocket подключения
function createSocketConnection(ticketId, userId, windowNumber) {
	return new Promise((resolve) => {
		// Подключаемся к namespace /support
		// В Socket.io v4 namespace указывается в URL
		const socket = io(`${WS_URL}/support`, {
			transports: ['websocket', 'polling'],
			reconnection: true,
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
			timeout: 10000,
			forceNew: true,
			path: '/socket.io', // путь к Socket.io серверу
		});

		socket.on('connect', () => {
			console.log(
				`✅ Window ${windowNumber} connected to /support namespace with id:`,
				socket.id
			);
			console.log(`   Namespace: ${socket.nsp.name}`);
			console.log(`   Transport: ${socket.io.engine.transport.name}`);

			// Присоединяемся к тикету
			socket.emit('join_ticket', { ticketId });

			// Проверяем подключение обоих окон
			setTimeout(() => {
				if (socket1?.connected && socket2?.connected) {
					updateConnectionStatus('Подключено', 'connected');
				}
			}, 500);
		});

		// Получаем историю сообщений
		socket.on('ticket:history', (messages) => {
			console.log(`Window ${windowNumber} received history:`, messages);
			const messagesContainer = document.getElementById(
				`messages${windowNumber}`
			);
			messagesContainer.innerHTML = '';
			if (Array.isArray(messages)) {
				messages.forEach((msg) => addMessage(msg, windowNumber));
			}
		});

		// Новое сообщение
		socket.on('message:new', (message) => {
			console.log(
				`Window ${windowNumber} received new message:`,
				message
			);
			addMessage(message, windowNumber);
		});

		// Уведомление о новом сообщении
		socket.on('ticket:new_message', (data) => {
			console.log(`Window ${windowNumber} received notification:`, data);
			if (data.message) {
				addMessage(data.message, windowNumber);
			}
		});

		// Ошибки
		socket.on('error', (error) => {
			console.error(`Window ${windowNumber} socket error:`, error);
			updateConnectionStatus('Ошибка подключения', 'error');
		});

		socket.on('connect_error', (error) => {
			console.error(`❌ Window ${windowNumber} connection error:`, error);
			console.error(`   Error type: ${error.type || 'unknown'}`);
			console.error(`   Error message: ${error.message || 'No message'}`);
			console.error(`   Attempted URL: ${WS_URL}/support`);
			console.error(`   Socket.io path: /socket.io`);

			// Формируем сообщение об ошибке
			let errorMessage = error.message || 'Неизвестная ошибка';
			const isHttpsPage = window.location.protocol === 'https:';
			const isHttpApi = WS_URL.startsWith('http://');

			if (isHttpsPage && isHttpApi) {
				errorMessage += ' (Mixed Content: HTTPS → HTTP)';
			}

			updateConnectionStatus(
				'Ошибка подключения: ' + errorMessage,
				'error'
			);

			// Показываем подсказки
			console.log('\n💡 Проверьте:');
			console.log('   1. Запущен ли сервер на ' + WS_URL);
			console.log('   2. Доступен ли namespace /support');
			console.log('   3. Нет ли проблем с CORS');
			if (isHttpsPage && isHttpApi) {
				console.log('   4. Mixed Content: HTTPS страница → HTTP API');
				console.log('      Браузер может блокировать подключение');
				console.log(
					'      Рассмотрите использование HTTPS для API или прокси'
				);
			}
			console.log(
				'   5. Правильно ли настроен WebSocket Gateway в NestJS\n'
			);
		});

		socket.on('disconnect', (reason) => {
			console.log(`Window ${windowNumber} disconnected:`, reason);
			updateConnectionStatus('Отключено', 'disconnected');
		});

		resolve(socket);
	});
}

// Отправка сообщения
function sendMessage(socket, content, userId, senderType, windowNumber) {
	if (!socket || !socket.connected) {
		alert(`Не подключено к WebSocket (окно ${windowNumber})`);
		return;
	}

	socket.emit('send_message', {
		ticketId: currentTicketId,
		senderId: userId,
		senderType: senderType,
		content: content,
		messageType: 'TEXT',
	});
}

// Обновление статуса подключения
function updateConnectionStatus(status, className) {
	const statusEl = document.getElementById('connectionStatus');
	if (statusEl) {
		statusEl.textContent = status;
		statusEl.className = `connection-status ${className}`;
	}
}

// Добавление сообщения в чат
function addMessage(message, windowNumber) {
	const messagesContainer = document.getElementById(
		`messages${windowNumber}`
	);
	if (!messagesContainer) return;

	const messageEl = document.createElement('div');
	messageEl.className = `message ${
		message.senderType?.toLowerCase() || 'user'
	}`;

	const time = new Date(message.createdAt).toLocaleTimeString('ru-RU');
	const senderLabel = getSenderLabel(message.senderType);

	messageEl.innerHTML = `
        <div class="message-header">
            <span class="sender">${senderLabel}: ${
		message.senderId || 'Unknown'
	}</span>
            <span class="time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(
			message.content || message.text || ''
		)}</div>
    `;

	messagesContainer.appendChild(messageEl);
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Получение метки отправителя
function getSenderLabel(senderType) {
	const labels = {
		USER: '👤 Пользователь',
		AGENT: '🛟 Агент',
		BOT: '🤖 Бот',
	};
	return labels[senderType] || senderType;
}

// Загрузка информации о тикете
async function loadTicketInfo(ticketId) {
	try {
		const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}`);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const ticket = await response.json();
		displayTicketInfo(ticket);
	} catch (error) {
		console.error('Error loading ticket:', error);
		const errorMsg = error.message || 'Неизвестная ошибка';
		const isHttpsPage = window.location.protocol === 'https:';
		const isHttpApi = API_BASE_URL.startsWith('http://');

		// Если это Mixed Content ошибка, показываем информативное сообщение
		// но не блокируем работу приложения
		if (isHttpsPage && isHttpApi && errorMsg.includes('Failed to fetch')) {
			displayTicketInfoLimited(ticketId);
			return;
		}

		// Для других ошибок показываем стандартное сообщение
		document.getElementById('ticketInfo').innerHTML = `
            <div class="ticket-details">
                <p><strong>ID:</strong> ${ticketId}</p>
                <p class="error" style="margin-top: 10px;">Ошибка загрузки тикета: ${errorMsg}</p>
            </div>
        `;
	}
}

// Отображение ограниченной информации о тикете при Mixed Content
function displayTicketInfoLimited(ticketId) {
	const ticketInfo = document.getElementById('ticketInfo');
	ticketInfo.innerHTML = `
        <div class="ticket-details">
            <p><strong>ID:</strong> ${ticketId}</p>
            <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px;">
                <p style="margin: 0; color: #856404; font-size: 13px;">
                    <strong>⚠️ Mixed Content:</strong> Детали тикета недоступны через REST API 
                    (HTTPS страница → HTTP API). WebSocket подключение работает нормально.
                </p>
            </div>
            <p style="margin-top: 10px; font-size: 12px; color: #666;">
                Вы можете отправлять и получать сообщения через WebSocket. 
                Для просмотра полной информации о тикете используйте локальную версию приложения.
            </p>
        </div>
    `;
}

// Отображение информации о тикете
function displayTicketInfo(ticket) {
	const ticketInfo = document.getElementById('ticketInfo');
	const statusLabels = {
		OPEN: '🟢 Открыт',
		IN_PROGRESS: '🟡 В работе',
		RESOLVED: '✅ Решен',
		CLOSED: '🔴 Закрыт',
	};

	const priorityLabels = {
		LOW: 'Низкий',
		NORMAL: 'Обычный',
		HIGH: 'Высокий',
		URGENT: 'Срочный',
	};

	ticketInfo.innerHTML = `
        <div class="ticket-details">
            <p><strong>ID:</strong> ${ticket.id}</p>
            <p><strong>Тема:</strong> ${escapeHtml(ticket.subject)}</p>
            <p><strong>Описание:</strong> ${escapeHtml(ticket.description)}</p>
            <p><strong>Статус:</strong> ${
				statusLabels[ticket.status] || ticket.status
			}</p>
            <p><strong>Приоритет:</strong> ${
				priorityLabels[ticket.priority] || ticket.priority
			}</p>
            ${
				ticket.category
					? `<p><strong>Категория:</strong> ${ticket.category}</p>`
					: ''
			}
            ${
				ticket.assignedTo
					? `<p><strong>Назначен:</strong> ${ticket.assignedTo.userId}</p>`
					: '<p><strong>Назначен:</strong> Не назначен</p>'
			}
            <p><strong>Создан:</strong> ${new Date(
				ticket.createdAt
			).toLocaleString('ru-RU')}</p>
            <p><strong>Обновлен:</strong> ${new Date(
				ticket.updatedAt
			).toLocaleString('ru-RU')}</p>
        </div>
    `;
}

// Создание нового тикета
async function createTicket() {
	const userId1 = document.getElementById('userId1').value.trim();
	if (!userId1) {
		alert('Введите User ID для пользователя 1');
		return;
	}

	const subject = prompt('Введите тему тикета:');
	if (!subject) return;

	const description = prompt('Введите описание тикета:');
	if (!description) return;

	try {
		const response = await fetch(`${API_BASE_URL}/tickets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				userId: userId1,
				subject: subject,
				description: description,
				priority: 'NORMAL',
				category: 'TECHNICAL',
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || `HTTP ${response.status}`);
		}

		const ticket = await response.json();
		document.getElementById('ticketId').value = ticket.id;
		connectToTicket(ticket.id);
		alert(`Тикет создан: ${ticket.id}`);
	} catch (error) {
		console.error('Error creating ticket:', error);
		const errorMsg = error.message || 'Неизвестная ошибка';
		const isHttpsPage = window.location.protocol === 'https:';
		const isHttpApi = API_BASE_URL.startsWith('http://');

		let displayError = errorMsg;
		if (isHttpsPage && isHttpApi && errorMsg.includes('Failed to fetch')) {
			displayError =
				'Mixed Content: HTTPS страница не может подключиться к HTTP API. Используйте HTTPS для API или прокси.';
		}

		alert('Ошибка создания тикета: ' + displayError);
	}
}

// Экранирование HTML
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}
