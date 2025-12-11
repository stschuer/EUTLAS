import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SsoConfigDocument = SsoConfig & Document;

export type SsoProvider = 'saml' | 'oidc';
export type OidcProvider = 'google' | 'microsoft' | 'okta' | 'auth0' | 'custom';

@Schema({ timestamps: true })
export class SamlConfig {
  @Prop({ required: true })
  entryPoint: string; // IdP SSO URL

  @Prop({ required: true })
  issuer: string; // SP Entity ID

  @Prop({ required: true })
  cert: string; // IdP Certificate (X.509)

  @Prop()
  privateKey?: string; // SP Private Key (for signing)

  @Prop()
  privateCert?: string; // SP Certificate

  @Prop({ default: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress' })
  identifierFormat: string;

  @Prop({ default: false })
  wantAssertionsSigned: boolean;

  @Prop({ default: false })
  wantAuthnResponseSigned: boolean;

  @Prop({ type: Object })
  attributeMapping?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
}

@Schema({ timestamps: true })
export class OidcConfig {
  @Prop({ required: true, enum: ['google', 'microsoft', 'okta', 'auth0', 'custom'] })
  provider: OidcProvider;

  @Prop({ required: true })
  clientId: string;

  @Prop({ required: true })
  clientSecret: string;

  @Prop()
  issuer?: string; // Required for custom/okta/auth0

  @Prop()
  authorizationURL?: string;

  @Prop()
  tokenURL?: string;

  @Prop()
  userInfoURL?: string;

  @Prop({ type: [String], default: ['openid', 'email', 'profile'] })
  scope: string[];

  @Prop({ type: Object })
  attributeMapping?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
}

@Schema({ timestamps: true })
export class SsoConfig {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['saml', 'oidc'] })
  type: SsoProvider;

  @Prop({ default: false })
  enabled: boolean;

  @Prop({ default: false })
  enforced: boolean; // Force all users to use SSO

  @Prop({ type: [String], default: [] })
  emailDomains: string[]; // Auto-assign users with these domains

  @Prop({ type: SamlConfig })
  saml?: SamlConfig;

  @Prop({ type: OidcConfig })
  oidc?: OidcConfig;

  @Prop({ type: Object })
  roleMapping?: {
    [groupName: string]: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';
  };

  @Prop({ default: 'MEMBER' })
  defaultRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';

  @Prop({ default: true })
  allowJitProvisioning: boolean; // Just-in-time user provisioning

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy: Types.ObjectId;

  @Prop()
  lastUsedAt?: Date;

  @Prop({ default: 0 })
  loginCount: number;
}

export const SsoConfigSchema = SchemaFactory.createForClass(SsoConfig);

// Indexes
SsoConfigSchema.index({ orgId: 1, type: 1 });
SsoConfigSchema.index({ emailDomains: 1 });



