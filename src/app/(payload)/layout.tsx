/* Diseño del panel de administración. Lo genera Payload. */
import config from '@payload-config'
import '@payloadcms/next/css'
import { RootLayout } from '@payloadcms/next/layouts'
import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions } from '@payloadcms/next/utilities'
import React from 'react'
import { importMap } from './importMap'

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({ ...args, config, importMap })
}

const Layout = ({ children }: { children: React.ReactNode }) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
