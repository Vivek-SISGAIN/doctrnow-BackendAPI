import { getChannel, EXCHANGES, getOtpRabbitMQConfig } from '../config/rabbitmq';

export class QueueService {
  static async publishMessage(routingKey: string, payload: any) {
    const channel = getChannel();
    
    const bufferResponse = Buffer.from(JSON.stringify(payload));
    
    // Publish to MAIN exchange
    channel.publish(EXCHANGES.MAIN, routingKey, bufferResponse, {
      persistent: true,
    });
  }

  static async publishOtpEvent(payload: any) {
    const channel = getChannel();
    const otpConfig = getOtpRabbitMQConfig();
    const bufferResponse = Buffer.from(JSON.stringify(payload));

    channel.publish(otpConfig.exchange, otpConfig.routingKey, bufferResponse, {
      persistent: true,
    });
  }
}
