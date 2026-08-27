import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const internalKey = req?.headers?.['x-internal-service-key'];
    const internalSecret = process.env.INTERNAL_SERVICE_SECRET || 'super_secret_internal_key_123';

    // 1. Completely bypass throttling for internal microservice-to-microservice calls
    if (internalKey && internalSecret && internalKey === internalSecret) {
      return true;
    }

    // 2. Completely bypass if @SkipThrottle() decorator is present on the controller or method
    const skipThrottle = this.reflector.getAllAndOverride<boolean | Record<string, boolean>>(
      'THROTTLER:SKIP',
      [context.getHandler(), context.getClass()],
    );

    if (
      skipThrottle === true ||
      (typeof skipThrottle === 'object' && skipThrottle !== null && Object.values(skipThrottle).some((v) => v === true))
    ) {
      return true;
    }

    return super.canActivate(context);
  }
}
