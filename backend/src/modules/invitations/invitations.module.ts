import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { Invitation, InvitationSchema } from './schemas/invitation.schema';
import { OrgsModule } from '../orgs/orgs.module';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../events/events.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invitation.name, schema: InvitationSchema },
    ]),
    forwardRef(() => OrgsModule),
    UsersModule,
    EventsModule,
    EmailModule,
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}




