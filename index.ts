import { createServer } from "http";
import { Server } from "socket.io";

// 1. Створюємо звичайний HTTP сервер
const httpServer = createServer();

// 2. Налаштовуємо Socket.io ("мізки" нашого чату)
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Дозволяємо підключатися з будь-якого сайту (важливо для розробки)
  }
});

// 3. Сценарій: Що робити, коли хтось підключився?
io.on("connection", (socket) => {
  console.log(`🔌 Новий користувач увійшов! ID: ${socket.id}`);

  // Чекаємо на повідомлення з назвою "chat-message"
  socket.on("chat-message", (msg) => {
    console.log(`📩 Отримано повідомлення: ${msg}`);
    
    // Пересилаємо це повідомлення ВІДРАЗУ всім, хто підключений
    io.emit("chat-message", msg);
  });

  // Що робити, коли людина закрила вкладку чату
  socket.on("disconnect", () => {
    console.log(`❌ Користувач ${socket.id} вийшов з чату`);
  });
});

// 4. Запускаємо сервер на порту 3000
const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Ядро месенджера Ilissiot запущено!`);
  console.log(`🔗 Адреса сервера: http://localhost:${PORT}`);
});