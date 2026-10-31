
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

export default function App() {
  const [token, setToken] = useState(
    sessionStorage.getItem("taskflow_token") || ""
  );

  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [error, setError] = useState("");

  async function request(path, options = {}, authToken = token) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...(authToken
          ? { Authorization: `Bearer ${authToken}` }
          : {}),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : `Ошибка HTTP ${response.status}`
      );
    }

    return data;
  }

  async function loadTasks(authToken = token) {
    const data = await request("/api/tasks", {}, authToken);
    setTasks(data);
  }

  useEffect(() => {
    if (!token) {
      setUser(null);
      setTasks([]);
      return;
    }

    Promise.all([
      request("/api/auth/me", {}, token),
      request("/api/tasks", {}, token),
    ])
      .then(([profile, taskList]) => {
        setUser(profile);
        setTasks(taskList);
        setError("");
      })
      .catch((err) => {
        setError(err.message);
      });
  }, [token]);

  async function handleAuth(event) {
    event.preventDefault();
    setError("");

    try {
      if (mode === "register") {
        await request("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username,
            email,
            password,
          }),
        });
      }

      const form = new URLSearchParams();
      form.set("username", username);
      form.set("password", password);

      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Ошибка входа"
        );
      }

      sessionStorage.setItem(
        "taskflow_token",
        data.access_token
      );

      setToken(data.access_token);
      setPassword("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function addTask(event) {
    event.preventDefault();
    setError("");

    try {
      await request("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          priority,
        }),
      });

      setTitle("");
      setDescription("");
      setPriority("medium");

      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleTask(task) {
    setError("");

    try {
      await request(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({
          completed: !task.completed,
        }),
      });

      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(id) {
    setError("");

    try {
      await request(`/api/tasks/${id}`, {
        method: "DELETE",
      });

      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    sessionStorage.removeItem("taskflow_token");

    setToken("");
    setUser(null);
    setTasks([]);
    setSearch("");
    setFilter("all");
    setError("");
  }

  // Статистика задач
  const completedCount = tasks.filter(
    (task) => task.completed
  ).length;

  const activeCount = tasks.length - completedCount;

  // Поиск и фильтрация задач
  const filteredTasks = tasks.filter((task) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      task.title.toLowerCase().includes(query) ||
      (task.description || "")
        .toLowerCase()
        .includes(query);

    const matchesFilter =
      filter === "all" ||
      (filter === "active" && !task.completed) ||
      (filter === "completed" && task.completed);

    return matchesSearch && matchesFilter;
  });

  return (
    <main className="container">
      <header className="header">
        <h1>✓ TaskFlow</h1>

        {token && (
          <div className="userbar">
            <span>
              {user?.username || "Пользователь"}
            </span>

            <button
              className="secondary"
              onClick={logout}
            >
              Выйти
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {!token ? (
        <section className="panel auth">
          <h2>
            {mode === "login" ? "Вход" : "Регистрация"}
          </h2>

          <form onSubmit={handleAuth}>
            <input
              placeholder="Имя пользователя"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              minLength={3}
              required
            />

            {mode === "register" && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
              />
            )}

            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              minLength={8}
              required
            />

            <button type="submit">
              {mode === "login"
                ? "Войти"
                : "Создать аккаунт"}
            </button>
          </form>

          <button
            className="link"
            onClick={() => {
              setMode(
                mode === "login"
                  ? "register"
                  : "login"
              );
              setError("");
            }}
          >
            {mode === "login"
              ? "Нет аккаунта? Зарегистрироваться"
              : "Уже есть аккаунт? Войти"}
          </button>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>Новая задача</h2>

            <form onSubmit={addTask}>
              <input
                placeholder="Название задачи"
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                maxLength={100}
                required
              />

              <textarea
                placeholder="Описание"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
              />

              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value)
                }
              >
                <option value="low">
                  Низкий приоритет
                </option>
                <option value="medium">
                  Средний приоритет
                </option>
                <option value="high">
                  Высокий приоритет
                </option>
              </select>

              <button type="submit">
                + Добавить задачу
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Мои задачи</h2>

            {/* Статистика */}
            <div className="stats">
              <div className="stat-card">
                <span>Всего задач</span>
                <strong>{tasks.length}</strong>
              </div>

              <div className="stat-card">
                <span>Активные</span>
                <strong>{activeCount}</strong>
              </div>

              <div className="stat-card">
                <span>Выполненные</span>
                <strong>{completedCount}</strong>
              </div>
            </div>

            {/* Поиск и фильтры */}
            <div className="toolbar">
              <input
                type="search"
                placeholder="Поиск задач..."
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
              />

              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value)
                }
              >
                <option value="all">
                  Все задачи
                </option>
                <option value="active">
                  Активные
                </option>
                <option value="completed">
                  Выполненные
                </option>
              </select>
            </div>

            {/* Список задач */}
            {filteredTasks.length === 0 ? (
              <p className="muted">
                {tasks.length === 0
                  ? "Пока нет задач. Создай первую!"
                  : "По выбранным условиям задачи не найдены."}
              </p>
            ) : (
              <div className="tasks">
                {filteredTasks.map((task) => (
                  <article
                    className={`task ${
                      task.completed ? "completed" : ""
                    }`}
                    key={task.id}
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() =>
                        toggleTask(task)
                      }
                      aria-label={`Выполнить: ${task.title}`}
                    />

                    <div className="task-content">
                      <strong>{task.title}</strong>
                      <p>{task.description}</p>

                      <span
                        className={`priority ${task.priority}`}
                      >
                        {task.priority === "high"
                          ? "Высокий"
                          : task.priority === "medium"
                          ? "Средний"
                          : "Низкий"}
                      </span>
                    </div>

                    <button
                      className="danger"
                      onClick={() =>
                        deleteTask(task.id)
                      }
                    >
                      Удалить
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
