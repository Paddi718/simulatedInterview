from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=100)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: str | None = None
    tts_preference: dict | None = None
    llm_config: dict | None = None
    created_at: str

    class Config:
        from_attributes = True


class UpdateUserRequest(BaseModel):
    tts_preference: dict | None = None
    llm_config: dict | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
