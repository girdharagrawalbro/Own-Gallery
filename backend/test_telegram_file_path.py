import asyncio
import os
from telegram import Bot
from dotenv import load_dotenv

load_dotenv()
bot = Bot(token=os.getenv("TELEGRAM_BOT_TOKEN"))

async def test():
    # We need a valid file_id from DB
    pass

asyncio.run(test())
