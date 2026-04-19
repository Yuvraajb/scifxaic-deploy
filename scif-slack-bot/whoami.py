from slack_sdk import WebClient
import os
from dotenv import load_dotenv
load_dotenv()

client = WebClient(token=os.getenv("SLACK_BOT_TOKEN"))
for u in client.users_list()["members"]:
    if not u.get("is_bot") and not u.get("deleted"):
        print(u["id"], "-", u.get("real_name", ""))
