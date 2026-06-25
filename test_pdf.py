import asyncio
from app.services.document_service import generate_document

async def t():
    from app.database import async_session_factory
    from sqlalchemy import text
    async with async_session_factory() as db:
        r = await db.execute(text("SELECT id FROM interviews ORDER BY created_at DESC LIMIT 1"))
        iid = str(r.fetchone()[0])
        path = await generate_document(db, iid, "pdf", "/tmp")
        import os
        size = os.path.getsize(path) if os.path.exists(path) else -1
        with open(path, "rb") as f:
            head = f.read(10)
            is_pdf = head[:5] == b"%PDF-"
        print("is_PDF:", is_pdf, "size:", size)
asyncio.run(t())
