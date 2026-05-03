import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@devx/db';

const GOOGLE_DOMAIN = process.env.GOOGLE_DOMAIN ?? 'devxlabs.ai';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          hd: GOOGLE_DOMAIN,
          scope: 'openid email profile',
          prompt: 'select_account',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 0, // Re-invoke jwt callback on every session check so role changes take effect immediately
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ profile, account }) {
      const email = profile?.email ?? '';

      // Enforce company domain
      if (!email.endsWith(`@${GOOGLE_DOMAIN}`)) {
        return false;
      }

      // Check if employee already exists and is active
      const employee = await prisma.employees.findUnique({
        where: { email },
        select: { id: true, status: true },
      });

      if (employee && employee.status === 'ACTIVE') {
        return true;
      }

      const googleId = (profile as any)?.sub ?? account?.providerAccountId ?? '';
      const name = profile?.name ?? email.split('@')[0];
      const avatarUrl = (profile as any)?.picture ?? null;

      // Check for a pending invite (determines system_role)
      const invite = await prisma.rms_invites.findFirst({
        where: { email, status: 'PENDING', expires_at: { gt: new Date() } },
      });

      const systemRole = invite?.system_role ?? 'EMPLOYEE';

      // Get default function & role
      let defaultFunction = await prisma.functions.findFirst({ where: { name: 'Tech' } });
      if (!defaultFunction) {
        defaultFunction = await prisma.functions.create({ data: { name: 'Tech' } });
      }

      let defaultRole = await prisma.roles.findFirst({
        where: { name: 'SDE-1', function_id: defaultFunction.id },
      });
      if (!defaultRole) {
        defaultRole = await prisma.roles.create({
          data: { name: 'SDE-1', function_id: defaultFunction.id },
        });
      }

      // Create or reactivate the employee
      if (employee) {
        // Employee exists but inactive — reactivate
        await prisma.employees.update({
          where: { email },
          data: {
            status: 'ACTIVE',
            system_role: systemRole,
            google_id: googleId,
            name,
            avatar_url: avatarUrl,
            deleted_at: null,
          },
        });
      } else {
        // Brand new employee — auto-create on first sign-in
        await prisma.employees.create({
          data: {
            google_id: googleId,
            email,
            name,
            avatar_url: avatarUrl,
            function_id: defaultFunction.id,
            role_id: defaultRole.id,
            system_role: systemRole,
            status: 'ACTIVE',
          },
        });
      }

      // Mark invite as accepted if one existed
      if (invite) {
        await prisma.rms_invites.update({
          where: { id: invite.id },
          data: { status: 'ACCEPTED', accepted_at: new Date() },
        });
      }

      return true;
    },

    async jwt({ token, profile }) {
      // On first sign-in, set employee_id from profile
      if (profile?.email) {
        const employee = await prisma.employees.findUnique({
          where: { email: profile.email },
          select: { id: true, system_role: true, pod_id: true },
        });
        if (employee) {
          token.employee_id = employee.id;
          token.system_role = employee.system_role;
          token.pod_id = employee.pod_id;
        }
      }

      // On every token refresh, re-read system_role + pod_id from DB so that
      // admin promotions (or demotions) take effect on the next request without
      // requiring a full sign-out/sign-in cycle.
      if (token.employee_id && !profile?.email) {
        const employee = await prisma.employees.findUnique({
          where: { id: token.employee_id as string },
          select: { system_role: true, pod_id: true },
        });
        if (employee) {
          token.system_role = employee.system_role;
          token.pod_id = employee.pod_id;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token.employee_id) {
        session.user.id = token.employee_id as string;
        session.user.system_role = token.system_role as string;
        session.user.pod_id = token.pod_id as string | null;
      }
      return session;
    },
  },
};
