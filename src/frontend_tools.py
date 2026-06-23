import requests
from datetime import datetime
from zoneinfo import ZoneInfo
from pydantic import BaseModel, Field


def _format_value(value):
    if value is None or value == "":
        return ""
    return str(value)


class Tools:
    class Valves(BaseModel):
        api_base_url: str = Field(default="http://localhost:4000")
        timezone: str = Field(default="America/Los_Angeles")

    def __init__(self):
        self.valves = self.Valves()

    def get_current_datetime(self):
        """Get the current local date, time, and timezone for resolving relative reminder dates."""
        now = datetime.now(ZoneInfo(self.valves.timezone))
        return (
            f"Current date: {now.strftime('%Y-%m-%d')}. "
            f"Current time: {now.strftime('%H:%M:%S')}. "
            f"Timezone: {self.valves.timezone}. "
            f"Current ISO datetime: {now.isoformat()}."
        )

    def create_expense(
        self, description: str, amount: float, category: str = "", notes: str = ""
    ):
        """Create a new expense when the user wants to save spending."""
        payload = {"description": description, "amount": amount}
        if category:
            payload["category"] = category
        if notes:
            payload["notes"] = notes

        r = requests.post(
            f"{self.valves.api_base_url}/api/expenses", json=payload, timeout=15
        )
        r.raise_for_status()
        data = r.json()

        text = f"Saved expense '{data.get('description', description)}' for {data.get('amount', amount)}."
        if data.get("category"):
            text += f" Category: {data['category']}."
        return text

    def list_expenses(self, limit: int = 10):
        """List recent expenses."""
        r = requests.get(
            f"{self.valves.api_base_url}/api/expenses",
            params={"limit": limit},
            timeout=15,
        )
        r.raise_for_status()
        items = r.json()

        if not items:
            return "No expenses found."

        lines = []
        for index, item in enumerate(items, start=1):
            description = _format_value(item.get("description")) or "Unnamed expense"
            amount = _format_value(item.get("amount")) or "unknown amount"
            category = _format_value(item.get("category"))
            expense_id = _format_value(item.get("id"))

            line = f"{index}. {description} - {amount}"
            if category:
                line += f" ({category})"
            if expense_id:
                line += f" [id: {expense_id}]"
            lines.append(line)

        return "Recent expenses:\n" + "\n".join(lines)

    def update_expense(self, id: str, **fields):
        """Update an existing expense by id."""
        r = requests.patch(
            f"{self.valves.api_base_url}/api/expenses/{id}", json=fields, timeout=15
        )
        r.raise_for_status()
        data = r.json()

        description = _format_value(data.get("description")) or "expense"
        return f"Updated {description}."

    def delete_expense(self, id: str):
        """Delete an existing expense by id."""
        r = requests.delete(f"{self.valves.api_base_url}/api/expenses/{id}", timeout=15)
        r.raise_for_status()
        return f"Deleted expense {id}."

    def create_reminder(self, text: str, remindAt: str = "", status: str = "not_complete"):
        """Create a reminder when the user wants to remember something later."""
        payload = {"text": text, "status": status}
        if remindAt:
            payload["remindAt"] = remindAt

        r = requests.post(
            f"{self.valves.api_base_url}/api/reminders", json=payload, timeout=15
        )
        r.raise_for_status()
        data = r.json()

        result = f"Saved reminder '{data.get('text', text)}'."
        if data.get("status"):
            result += f" Status: {data['status']}."
        return result

    def list_reminders(self, limit: int = 10):
        """List recent reminders."""
        r = requests.get(
            f"{self.valves.api_base_url}/api/reminders",
            params={"limit": limit},
            timeout=15,
        )
        r.raise_for_status()
        items = r.json()

        if not items:
            return "No reminders found."

        lines = []
        for index, item in enumerate(items, start=1):
            text = _format_value(item.get("text")) or "Unnamed reminder"
            status = _format_value(item.get("status")) or "not_complete"
            remind_at = _format_value(item.get("remindAt") or item.get("date"))
            reminder_id = _format_value(item.get("id"))

            line = f"{index}. {text} - {status}"
            if remind_at:
                line += f" at {remind_at}"
            if reminder_id:
                line += f" [id: {reminder_id}]"
            lines.append(line)

        return "Recent reminders:\n" + "\n".join(lines)

    def update_reminder(self, id: str, **fields):
        """Update a reminder by id."""
        if "remindAt" in fields and fields["remindAt"]:
            fields["remindAt"] = str(fields["remindAt"])
        r = requests.patch(
            f"{self.valves.api_base_url}/api/reminders/{id}", json=fields, timeout=15
        )
        r.raise_for_status()
        data = r.json()

        text = _format_value(data.get("text")) or "reminder"
        status = _format_value(data.get("status"))
        result = f"Updated {text}."
        if status:
            result += f" Status: {status}."
        return result

    def delete_reminder(self, id: str):
        """Delete a reminder by id."""
        r = requests.delete(f"{self.valves.api_base_url}/api/reminders/{id}", timeout=15)
        r.raise_for_status()
        return f"Deleted reminder {id}."
