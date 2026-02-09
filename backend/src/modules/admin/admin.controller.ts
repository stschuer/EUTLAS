import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { GlobalAdminGuard } from './guards/global-admin.guard';
import { AdminService } from './admin.service';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TenantResponseDto,
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  AddUserToTenantDto,
  UpdateTenantMemberDto,
  TenantMemberResponseDto,
  AdminStatsDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, GlobalAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============ Stats ============

  @Get('stats')
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  @ApiResponse({ status: 200, type: AdminStatsDto })
  async getStats(): Promise<AdminStatsDto> {
    return this.adminService.getStats();
  }

  // ============ Tenants ============

  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants (organizations)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200 })
  async listTenants(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ): Promise<{ tenants: TenantResponseDto[]; total: number; pages: number }> {
    return this.adminService.listTenants(page || 1, limit || 20, search);
  }

  @Get('tenants/:tenantId')
  @ApiOperation({ summary: 'Get tenant details' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async getTenant(@Param('tenantId') tenantId: string): Promise<TenantResponseDto> {
    return this.adminService.getTenant(tenantId);
  }

  @Post('tenants')
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, type: TenantResponseDto })
  async createTenant(@Body() dto: CreateTenantDto): Promise<TenantResponseDto> {
    return this.adminService.createTenant(dto);
  }

  @Put('tenants/:tenantId')
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async updateTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    return this.adminService.updateTenant(tenantId, dto);
  }

  @Delete('tenants/:tenantId')
  @ApiOperation({ summary: 'Delete a tenant' })
  @ApiResponse({ status: 204 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTenant(@Param('tenantId') tenantId: string): Promise<void> {
    return this.adminService.deleteTenant(tenantId);
  }

  // ============ Tenant Members ============

  @Get('tenants/:tenantId/members')
  @ApiOperation({ summary: 'List members of a tenant' })
  @ApiResponse({ status: 200, type: [TenantMemberResponseDto] })
  async listTenantMembers(
    @Param('tenantId') tenantId: string,
  ): Promise<TenantMemberResponseDto[]> {
    return this.adminService.listTenantMembers(tenantId);
  }

  @Post('tenants/:tenantId/members')
  @ApiOperation({ summary: 'Add a user to a tenant' })
  @ApiResponse({ status: 201, type: TenantMemberResponseDto })
  async addUserToTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: AddUserToTenantDto,
  ): Promise<TenantMemberResponseDto> {
    return this.adminService.addUserToTenant(tenantId, dto);
  }

  @Put('tenants/:tenantId/members/:userId')
  @ApiOperation({ summary: 'Update member role in a tenant' })
  @ApiResponse({ status: 200, type: TenantMemberResponseDto })
  async updateTenantMember(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTenantMemberDto,
  ): Promise<TenantMemberResponseDto> {
    return this.adminService.updateTenantMember(tenantId, userId, dto);
  }

  @Delete('tenants/:tenantId/members/:userId')
  @ApiOperation({ summary: 'Remove a user from a tenant' })
  @ApiResponse({ status: 204 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeUserFromTenant(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.adminService.removeUserFromTenant(tenantId, userId);
  }

  // ============ Cluster Cleanup ============

  @Get('clusters/failed')
  @ApiOperation({ summary: 'List failed or stuck clusters that may need cleanup' })
  @ApiResponse({ status: 200 })
  async listFailedClusters() {
    return this.adminService.listFailedClusters();
  }

  @Delete('clusters/:clusterId/cleanup')
  @ApiOperation({
    summary: 'Clean up a failed cluster (delete K8s resources and DB records)',
  })
  @ApiResponse({
    status: 200,
    description: 'Cluster cleaned up successfully',
  })
  async cleanupFailedCluster(@Param('clusterId') clusterId: string) {
    return this.adminService.cleanupFailedCluster(clusterId);
  }

  // ============ Users ============

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200 })
  async listUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ): Promise<{ users: UserResponseDto[]; total: number; pages: number }> {
    return this.adminService.listUsers(page || 1, limit || 20, search);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Get user details' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getUser(@Param('userId') userId: string): Promise<UserResponseDto> {
    return this.adminService.getUser(userId);
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  async createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.adminService.createUser(dto);
  }

  @Put('users/:userId')
  @ApiOperation({ summary: 'Update a user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateUser(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.adminService.updateUser(userId, dto);
  }

  @Delete('users/:userId')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiResponse({ status: 204 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('userId') userId: string): Promise<void> {
    return this.adminService.deleteUser(userId);
  }

  @Get('users/:userId/tenants')
  @ApiOperation({ summary: 'Get tenants a user belongs to' })
  @ApiResponse({ status: 200, type: [TenantResponseDto] })
  async getUserTenants(@Param('userId') userId: string): Promise<TenantResponseDto[]> {
    return this.adminService.getUserTenants(userId);
  }
}

