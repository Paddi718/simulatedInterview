from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=100)
    email: str | None = Field(None, max_length=255)


class VerifyEmailRequest(BaseModel):
    username: str
    code: str


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
    username: str | None = Field(None, min_length=2, max_length=50)
    email: str | None = Field(None, max_length=255)
    current_password: str | None = None
    new_password: str | None = None
    tts_preference: dict | None = None
    llm_config: dict | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
