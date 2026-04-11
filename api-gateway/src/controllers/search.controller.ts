import { Controller, Get, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { mergeAndRank } from '../common/utils/search-ranker.util';


@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  private readonly profileServiceUrl: string;
  private readonly superAdminServiceUrl: string;
  private readonly internalSecret: string;

  constructor(private configService: ConfigService) {
    this.profileServiceUrl = this.configService.get<string>('PROFILE_SERVICE_URL') || 'http://localhost:3001';
    this.superAdminServiceUrl = this.configService.get<string>('SUPER_ADMIN_SERVICE_URL') || 'http://localhost:3007';
    this.internalSecret = this.configService.get<string>('INTERNAL_SERVICE_SECRET') || '';
  }

  @Get()
  @ApiOperation({ summary: 'Global search across microservices' })
  @ApiQuery({ name: 'q', required: true, description: 'Search term (min length: 2)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit per category' })
  @ApiQuery({ name: 'types', required: false, description: 'Comma-separated categories to search' })
  async search(@Query('q') q: string, @Query('limit') limitArg: string, @Query('types') typesArg: string, @Req() req: Request, @Res() res: Response) {
    if (!q || q.length < 2) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Query must be at least 2 characters long' });
    }

    const limit = parseInt(limitArg, 10) || 5;
    const types = typesArg ? typesArg.split(',') : [];
    const searchAll = types.length === 0;

    const wantSpecialties = searchAll || types.includes('specialties');
    const wantDoctors = searchAll || types.includes('doctors');
    const wantHospitals = searchAll || types.includes('hospitals');

    // Extract authorization to forward the token (user ID validation, if needed by internal services)
    const token = req.headers.authorization;
    const headers = {
      'Content-Type': 'application/json',
      'X-Internal-Sig': this.internalSecret,
    };
    if (token) {
      headers['Authorization'] = token;
    }

    const tasks: Promise<any>[] = [];

    // Profile Service: Specialties
    if (wantSpecialties) {
      tasks.push(
        fetch(`${this.profileServiceUrl}/internal/search/specialties?q=${encodeURIComponent(q)}&limit=${limit}`, { headers })
          .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
          .then((d: any) => d.data || [])
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    // Profile Service: Doctors
    if (wantDoctors) {
      tasks.push(
        fetch(`${this.profileServiceUrl}/internal/search/doctors?q=${encodeURIComponent(q)}&limit=${limit}`, { headers })
          .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
          .then((d: any) => d.data || [])
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    // Super Admin Service: Hospitals
    if (wantHospitals) {
      tasks.push(
        fetch(`${this.superAdminServiceUrl}/internal/search/hospitals?q=${encodeURIComponent(q)}&limit=${limit}`, { headers })
          .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
          .then((d: any) => d.data || [])
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    const [specialtiesResult, doctorsResult, hospitalsResult] = await Promise.allSettled(tasks);

    const specialties = specialtiesResult.status === 'fulfilled' ? specialtiesResult.value : [];
    const doctors = doctorsResult.status === 'fulfilled' ? doctorsResult.value : [];
    const hospitals = hospitalsResult.status === 'fulfilled' ? hospitalsResult.value : [];

    if (specialtiesResult.status === 'rejected') console.error('Specialties search failed:', specialtiesResult.reason);
    if (doctorsResult.status === 'rejected') console.error('Doctors search failed:', doctorsResult.reason);
    if (hospitalsResult.status === 'rejected') console.error('Hospitals search failed:', hospitalsResult.reason);

    const results = mergeAndRank({ specialties, doctors, hospitals }, q);

    return res.status(HttpStatus.OK).json({
      success: true,
      query: q,
      results,
      meta: {
        counts: {
          specialties: results.specialties.length,
          doctors: results.doctors.length,
          hospitals: results.hospitals.length,
        },
        partialFailures: [
          specialtiesResult.status === 'rejected' ? 'specialties' : null,
          doctorsResult.status === 'rejected' ? 'doctors' : null,
          hospitalsResult.status === 'rejected' ? 'hospitals' : null,
        ].filter(Boolean),
      },
    });
  }
}
