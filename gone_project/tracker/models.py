from django.conf import settings
from django.db import models


class Profile(models.Model):
    # Existing profile rows remain unowned during migration; new account flows create
    # one profile per authenticated Django user.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name='gone_profile',
        on_delete=models.PROTECT,
    )
    name = models.CharField(max_length=100, blank=True, default='')
    budget = models.FloatField(default=0.0)
    monthly_income = models.FloatField(default=0.0)
    saving_goal = models.FloatField(null=True, blank=True)
    onboarding_complete = models.BooleanField(default=False)
    tour_complete = models.BooleanField(default=False)
    setup_version = models.PositiveSmallIntegerField(default=1)
    reminder_days = models.JSONField(default=dict, blank=True)
    last_seen_date = models.CharField(max_length=10, blank=True, default='')
    last_auto_log_date = models.CharField(max_length=10, blank=True, default='')
    recovery_question_1 = models.CharField(max_length=40, blank=True, default='')
    recovery_answer_hash_1 = models.CharField(max_length=128, blank=True, default='')
    recovery_question_2 = models.CharField(max_length=40, blank=True, default='')
    recovery_answer_hash_2 = models.CharField(max_length=128, blank=True, default='')
    recovery_lookup_hash = models.CharField(max_length=64, blank=True, default='', db_index=True)
    last_active = models.DateTimeField(null=True, blank=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile: {self.name or 'Anonymous'} (Budget: ₹{self.budget})"


class Entry(models.Model):
    KIND_CHOICES = [
        ('spent', 'Spent'),
        ('received', 'Received'),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name='gone_entries',
        on_delete=models.PROTECT,
    )
    entry_id = models.CharField(max_length=120, db_index=True)
    title = models.CharField(max_length=200)
    amount = models.FloatField()
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='spent')
    category = models.CharField(max_length=50, default='Other')
    date = models.CharField(max_length=20, db_index=True)
    source = models.CharField(max_length=50, default='manual')
    reminder_id = models.CharField(max_length=100, blank=True, default='')
    auto_logged = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']
        constraints = [models.UniqueConstraint(fields=['owner', 'entry_id'], name='unique_entry_id_per_owner')]

    def __str__(self):
        sign = '-' if self.kind == 'spent' else '+'
        return f"{self.date} | {self.title} ({sign}₹{self.amount})"


class Reminder(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name='gone_reminders',
        on_delete=models.PROTECT,
    )
    reminder_id = models.CharField(max_length=100, db_index=True)
    title = models.CharField(max_length=100)
    amount = models.FloatField()
    category = models.CharField(max_length=50, default='Other')
    icon = models.CharField(max_length=20, default='✦')
    created_on = models.CharField(max_length=20, default='')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['owner', 'reminder_id'], name='unique_reminder_id_per_owner')]

    def __str__(self):
        return f"{self.icon} {self.title} (₹{self.amount})"


class Split(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name='gone_splits',
        on_delete=models.PROTECT,
    )
    split_id = models.CharField(max_length=120, db_index=True)
    description = models.CharField(max_length=200)
    total = models.FloatField()
    friends = models.JSONField(default=list)
    date = models.CharField(max_length=20, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']
        constraints = [models.UniqueConstraint(fields=['owner', 'split_id'], name='unique_split_id_per_owner')]

    def __str__(self):
        return f"{self.description} (Total: ₹{self.total})"


class AuthAttempt(models.Model):
    PURPOSE_CHOICES = [
        ('login', 'Login'),
        ('recovery', 'Recovery'),
        ('register', 'Register'),
    ]

    purpose = models.CharField(max_length=12, choices=PURPOSE_CHOICES)
    client_hash = models.CharField(max_length=64, db_index=True)
    identifier_hash = models.CharField(max_length=64, blank=True, default='', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=['purpose', 'client_hash', 'created_at'], name='auth_client_window'),
            models.Index(fields=['purpose', 'identifier_hash', 'created_at'], name='auth_id_window'),
        ]

    def __str__(self):
        return f"{self.purpose} attempt at {self.created_at:%Y-%m-%d %H:%M}"
