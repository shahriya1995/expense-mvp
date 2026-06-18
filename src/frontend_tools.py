"""
title: Expense Tools
author: you
version: 1.0.0
"""

import requests
from pydantic import BaseModel, Field


class Tools:
    class Valves(BaseModel):
        api_base_url: str = Field(
            default="http://loca:4000/",
            description="Base URL for the expense backend",
        )

    def __init__(self):
        self.valves = self.Valves()

    def create_expense(
        self,
        description: str,
        amount: float,
        category: str = "uncategorized",
        notes: str = "",
    ) -> dict:
        """
        Save a new expense when the user mentions spending money.
        Infer the best description, amount, category, and notes from the user's wording.
        """
        response = requests.post(
            f"{self.valves.api_base_url}/api/expenses",
            json={
                "description": description,
                "amount": amount,
                "category": category,
                "notes": notes,
                "currency": "USD",
            },
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    def list_expenses(
        self,
        category: str = "",
        limit: int = 10,
        relative_day: str = "",
        days_back: int = 0,
    ) -> dict:
        """
        Retrieve expenses when the user wants to see recent spending or find an expense.
        Choose filters only when they are useful.
        """
        params = {}
        if category:
            params["category"] = category
        if limit:
            params["limit"] = limit
        if relative_day:
            params["relative_day"] = relative_day
        if days_back:
            params["days_back"] = days_back

        response = requests.get(
            f"{self.valves.api_base_url}/api/expenses",
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        return {"expenses": response.json()}

    def monthly_summary(self, month: int = 0, year: int = 0) -> dict:
        """
        Get the monthly spending summary when the user asks about totals or monthly breakdowns.
        """
        params = {}
        if month:
            params["month"] = month
        if year:
            params["year"] = year

        response = requests.get(
            f"{self.valves.api_base_url}/api/expenses/summary/monthly",
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    def update_expense(
        self,
        id: str,
        description: str = "",
        amount: float = 0,
        category: str = "",
        notes: str = "",
    ) -> dict:
        """
        Update an existing expense once the target expense is known.
        Use list_expenses first if you need to find the right id.
        """
        payload = {}
        if description:
            payload["description"] = description
        if amount:
            payload["amount"] = amount
        if category:
            payload["category"] = category
        if notes:
            payload["notes"] = notes

        response = requests.patch(
            f"{self.valves.api_base_url}/api/expenses/{id}",
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()

    def delete_expense(self, id: str) -> dict:
        """
        Delete an existing expense once the target expense is known.
        Use list_expenses first if you need to find the right id.
        """
        response = requests.delete(
            f"{self.valves.api_base_url}/api/expenses/{id}",
            timeout=15,
        )
        response.raise_for_status()
        return {"deleted": True, "id": id}
