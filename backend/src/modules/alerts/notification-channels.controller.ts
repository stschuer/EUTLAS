import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateNotificationChannelDto, UpdateNotificationChannelDto, TestNotificationChannelDto } from './dto/create-notification-channel.dto';

@ApiTags('Notification Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/notification-channels')
export class NotificationChannelsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly orgsService: OrgsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a notification channel' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() createDto: CreateNotificationChannelDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const channel = await this.notificationService.createChannel(
      orgId,
      user.userId,
      createDto,
    );

    return {
      success: true,
      data: channel,
      message: 'Notification channel created',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List notification channels' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const channels = await this.notificationService.findChannelsByOrg(orgId);

    return {
      success: true,
      data: channels,
    };
  }

  @Get(':channelId')
  @ApiOperation({ summary: 'Get notification channel details' })
  async findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('channelId') channelId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const channel = await this.notificationService.findChannelById(channelId);
    if (!channel || channel.orgId.toString() !== orgId) {
      throw new NotFoundException('Notification channel not found');
    }

    return {
      success: true,
      data: channel,
    };
  }

  @Patch(':channelId')
  @ApiOperation({ summary: 'Update a notification channel' })
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('channelId') channelId: string,
    @Body() updateDto: UpdateNotificationChannelDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const channel = await this.notificationService.findChannelById(channelId);
    if (!channel || channel.orgId.toString() !== orgId) {
      throw new NotFoundException('Notification channel not found');
    }

    const updated = await this.notificationService.updateChannel(channelId, updateDto);

    return {
      success: true,
      data: updated,
    };
  }

  @Delete(':channelId')
  @ApiOperation({ summary: 'Delete a notification channel' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('channelId') channelId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const channel = await this.notificationService.findChannelById(channelId);
    if (!channel || channel.orgId.toString() !== orgId) {
      throw new NotFoundException('Notification channel not found');
    }

    await this.notificationService.deleteChannel(channelId);

    return {
      success: true,
      message: 'Notification channel deleted',
    };
  }

  @Post(':channelId/test')
  @ApiOperation({ summary: 'Test a notification channel' })
  async test(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('channelId') channelId: string,
    @Body() testDto: TestNotificationChannelDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const channel = await this.notificationService.findChannelById(channelId);
    if (!channel || channel.orgId.toString() !== orgId) {
      throw new NotFoundException('Notification channel not found');
    }

    const result = await this.notificationService.testChannel(channelId, testDto.testMessage);

    return {
      success: result.success,
      message: result.success ? 'Test notification sent' : 'Test failed',
      error: result.error,
    };
  }
}



