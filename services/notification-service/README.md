# Notification Service

Handles SMS, Email, and Push notifications.

## Responsibilities

- SMS notifications
- Email notifications
- Push notifications (mobile apps)
- Notification queuing and retry
- Delivery status tracking
- Template management

## Storage

- Notification queue: MongoDB
- Delivery status: MongoDB
- Templates: Database or file system

## API Endpoints

- `POST /notifications/send` - Send notification
- `GET /notifications/:id/status` - Get delivery status
- `GET /notifications/user/:userId` - Get user notifications

## Events Consumed

- `AppointmentBooked` → Send confirmation SMS/Email
- `AppointmentCancelled` → Send cancellation notification
- `ConsultationStarted` → Send reminder push notification
- `PrescriptionGenerated` → Send prescription email
- `PaymentSuccess` → Send receipt email
- `PaymentFailed` → Send payment failure notification

## Channels

- SMS: Twilio, AWS SNS, or local UAE provider
- Email: AWS SES, SendGrid, or SMTP
- Push: FCM (Firebase Cloud Messaging), APNS (Apple Push Notification Service)

