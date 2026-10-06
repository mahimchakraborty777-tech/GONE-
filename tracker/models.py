from django.db import models

class Profile(models.Model):
    name = models.CharField(max_length=100, blank=True, default='')
    budget = models.FloatField(default=0.0)
    monthly_income = models.FloatField(default=0.0)
    saving_goal = models.FloatField(null=True, blank=True)
    onboarding_complete = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile: {self.name or 'Anonymous'} (Budget: ₹{self.budget})"

class Entry(models.Model):
    KIND_CHOICES = [
        ('spent', 'Spent'),
        ('received', 'Received'),
    ]

    entry_id = models.CharField(max_length=120, unique=True, db_index=True)
    title = models.CharField(max_length=200)
    amount = models.FloatField()
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='spent')
    category = models.CharField(max_length=50, default='Other')
    date = models.CharField(max_length=20, db_index=True)  # YYYY-MM-DD
    source = models.CharField(max_length=50, default='manual')
    reminder_id = models.CharField(max_length=100, blank=True, default='')
    auto_logged = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        sign = '-' if self.kind == 'spent' else '+'
        return f"{self.date} | {self.title} ({sign}₹{self.amount})"

class Reminder(models.Model):
    reminder_id = models.CharField(max_length=100, unique=True, db_index=True)
    title = models.CharField(max_length=100)
    amount = models.FloatField()
    category = models.CharField(max_length=50, default='Other')
    icon = models.CharField(max_length=20, default='✦')
    created_on = models.CharField(max_length=20, default='')

    def __str__(self):
        return f"{self.icon} {self.title} (₹{self.amount})"

class Split(models.Model):
    split_id = models.CharField(max_length=120, unique=True, db_index=True)
    description = models.CharField(max_length=200)
    total = models.FloatField()
    friends = models.JSONField(default=list)
    date = models.CharField(max_length=20, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.description} (Total: ₹{self.total})"
