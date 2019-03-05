'use strict'

const Hapi = require('hapi')
const Bcrypt = require('bcrypt')
const path = require('path')

const hashCmp = {
  bcrypt: async (pw, hash) => {
    return Bcrypt.compare(pw, hash) // returns a promise
  },
  plain: async (pw, hashNotReally) => {
    return pw === hashNotReally
  }
}

module.exports = ({host, port, authHash, auth}, core) => {
  const Server = new Hapi({host, port})

  return {
    start: async () => {
      const validate = async (request, username, password, h) => {
        const user = auth[username]
        if (!user) {
          return { credentials: null, isValid: false }
        }

        const isValid = hashCmp[authHash](password, user.password)
        const credentials = { id: username, name: username, permissions: user.permissions }

        return { isValid, credentials }
      }

      if (auth) {
        await Server.register(require('hapi-auth-basic'))

        Server.auth.strategy('simple', 'basic', { validate })
        Server.auth.default('simple')
      }

      await Server.register({
        plugin: require('hapi-pino'),
        options: {name: 'gweny:api'}
      })

      await Server.register({
        plugin: require('inert')
      })

      require('hapi-spa-serve')(Server, {assets: path.join(__dirname, '..', 'dist')})

      Server.route(({
        method: 'GET',
        path: '/api/v1',
        handler: async (h, request) => {
          const permissions = true

          const out = {}

          for (const operationId in core.Operations) {
            if (permissions === true || ~permissions.contains(operationId)) {
              const operation = core.Operations[operationId]
              const outOperation = out[operation] = {
                id: operation.id,
                meta: operation.meta,
                resources: {},
                healthChecks: {}
              }

              for (const healthCheckId in core.Operations[operationId].healthChecks) { // eslint-disable-line guard-for-in
                const healthCheck = core.Operations[operationId].healthChecks
                outOperation.healthChecks[healthCheckId] = {
                  id: healthCheck.id,
                  meta: healthCheck.meta,
                  interval: healthCheck.interval,
                  resource: {
                    id: healthCheck.resource.id,
                    check: healthCheck.checkId
                  },
                  status: {
                    healthy: Boolean(healthCheck.db.get('occurences')),
                    occurences: healthCheck.db.get('occurences'),
                    lastCheck: healthCheck.db.get('lastCheck')
                  }
                }
              }
            }
          }
        }
      }))
    }
  }
}