
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from database import get_db
from models import Task, User

app = FastAPI(
    title="TaskFlow API",
    description="Система управления задачами с PostgreSQL и JWT",
    version="2.0.0",
)

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
Priority = Literal["low", "medium", "high"]


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = ""
    priority: Priority = "medium"


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    priority: Priority | None = None
    completed: bool | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    description: str
    priority: Priority
    completed: bool


def find_task(db: Session, task_id: int, user_id: int) -> Task:
    task = db.scalar(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == user_id,
        )
    )

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Задача не найдена",
        )

    return task


@app.get("/")
def home():
    return {"message": "TaskFlow API работает", "status": "ok"}


@app.post(
    "/api/auth/register",
    response_model=UserResponse,
    status_code=201,
)
def register(data: UserCreate, db: DbSession):
    existing_user = db.scalar(
        select(User).where(
            or_(
                User.username == data.username,
                User.email == data.email,
            )
        )
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Имя пользователя или email уже заняты",
        )

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
    )

    db.add(user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Имя пользователя или email уже заняты",
        )

    db.refresh(user)
    return user


@app.post("/api/auth/login", response_model=TokenResponse)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
):
    user = db.scalar(
        select(User).where(User.username == form.username)
    )

    if user is None or not verify_password(
        form.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Неверное имя пользователя или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(
        access_token=create_access_token(user.id)
    )


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: CurrentUser):
    return current_user


@app.get("/api/tasks", response_model=list[TaskResponse])
def get_tasks(db: DbSession, current_user: CurrentUser):
    return db.scalars(
        select(Task)
        .where(Task.user_id == current_user.id)
        .order_by(Task.id)
    ).all()


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    return find_task(db, task_id, current_user.id)


@app.post(
    "/api/tasks",
    response_model=TaskResponse,
    status_code=201,
)
def create_task(
    task: TaskCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    new_task = Task(
        user_id=current_user.id,
        **task.model_dump(),
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    return new_task


@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    updated: TaskUpdate,
    db: DbSession,
    current_user: CurrentUser,
):
    task = find_task(db, task_id, current_user.id)

    for field, value in updated.model_dump(
        exclude_unset=True
    ).items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)

    return task


@app.delete("/api/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    task = find_task(db, task_id, current_user.id)

    db.delete(task)
    db.commit()

    return {"message": "Задача удалена"}

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)