import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { JwksService } from './jwks.service';

@ApiTags('jwks')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly jwksService: JwksService) {}

  @Public()
  @Get('jwks.json')
  @ApiOperation({
    summary: 'JWKS endpoint',
    description: 'Returns JSON Web Key Set for JWT verification (RS256)',
  })
  @ApiResponse({
    status: 200,
    description: 'JWKS document',
    schema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kty: { type: 'string', example: 'RSA' },
              use: { type: 'string', example: 'sig' },
              kid: { type: 'string' },
              n: { type: 'string' },
              e: { type: 'string' },
              alg: { type: 'string', example: 'RS256' },
            },
          },
        },
      },
    },
  })
  async getJWKS() {
    return this.jwksService.generateJWKS();
  }
}

