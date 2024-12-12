import asyncio
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from PIL import Image
import base64
import io
import json
from typing import List, Dict, Any
import aiohttp
import threading
import logging
import os

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Set gRPC environment variables
os.environ["GRPC_ENABLE_FORK_SUPPORT"] = "1"
os.environ["GRPC_POLL_STRATEGY"] = "epoll1"

class BrowserAgent:
    def __init__(self, model_name: str = "llava-1.5-7b-hf"):
        self.model_name = model_name
        self.driver = None
        self.api_endpoint = "http://localhost:52415/v1/chat/completions"

    def _log_thread_info(self):
        """Log information about current threads"""
        current_thread = threading.current_thread()
        all_threads = threading.enumerate()
        
        logger.debug(f"Current thread: {current_thread.name} (ID: {current_thread.ident})")
        logger.debug("All active threads:")
        for thread in all_threads:
            logger.debug(f"- {thread.name} (ID: {thread.ident})")

    async def start(self):
        self._log_thread_info()
        logger.debug("Starting browser agent...")
        try:
            options = webdriver.ChromeOptions()
            options.add_argument('--no-sandbox')
            options.add_argument('--window-size=1920,1080')
            self.driver = webdriver.Chrome(options=options)
            logger.debug("Browser started successfully")
        except Exception as e:
            logger.error(f"Error starting browser: {e}")
            raise

    async def stop(self):
        logger.debug("Stopping browser agent...")
        try:
            if self.driver:
                self.driver.quit()
            logger.debug("Browser stopped successfully")
        except Exception as e:
            logger.error(f"Error stopping browser: {e}")
            raise

    async def take_screenshot(self) -> str:
        logger.debug("Taking screenshot...")
        try:
            screenshot_bytes = self.driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(screenshot_bytes))
            buffered = io.BytesIO()
            image.save(buffered, format="PNG")
            logger.debug("Screenshot taken successfully")
            return base64.b64encode(buffered.getvalue()).decode()
        except Exception as e:
            logger.error(f"Error taking screenshot: {e}")
            raise

    async def analyze_and_act(self, task: str, screenshot_base64: str):
        logger.debug(f"Analyzing task: {task}")
        self._log_thread_info()
        
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Task: {task}\nAnalyze this screenshot and tell me what action to take next:"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{screenshot_base64}"
                        }
                    }
                ]
            }
        ]

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_endpoint,
                    json={
                        "model": self.model_name,
                        "messages": messages,
                        "temperature": 0.2
                    }
                ) as response:
                    result = await response.json()
                    logger.debug(f"Analysis result received: {result}")
                    return result["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"Error in analyze_and_act: {e}")
            raise

    async def execute_task(self, task: str):
        logger.debug(f"Executing task: {task}")
        self._log_thread_info()
        
        await self.start()
        try:
            while True:
                screenshot = await self.take_screenshot()
                analysis = await self.analyze_and_act(task, screenshot)
                
                try:
                    action = json.loads(analysis)
                    logger.debug(f"Parsed action: {action}")
                    
                    if action["action"] == "click":
                        element = WebDriverWait(self.driver, 10).until(
                            EC.element_to_be_clickable((By.CSS_SELECTOR, action["selector"]))
                        )
                        element.click()
                    elif action["action"] == "type":
                        element = WebDriverWait(self.driver, 10).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, action["selector"]))
                        )
                        element.send_keys(action["text"])
                        element.send_keys(Keys.RETURN)
                    elif action["action"] == "navigate":
                        self.driver.get(action["url"])
                    elif action["action"] == "complete":
                        break
                except json.JSONDecodeError:
                    logger.error(f"Invalid action format: {analysis}")
                    continue

                await asyncio.sleep(1)
        finally:
            await self.stop()

# For testing the agent directly
async def test_agent():
    agent = BrowserAgent()
    await agent.execute_task("Go to google.com and search for 'weather in New York'")

if __name__ == "__main__":
    asyncio.run(test_agent())
