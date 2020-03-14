// MQTT Thing Accessory plugin for Homebridge
// MQTT Library

'use strict';

var mqtt = require("mqtt");


var mqttlib = new function() {

    // MQTT message dispatch
    var mqttDispatch = {}; // map of topic to function( topic, message ) to handle

    //! Initialise MQTT. Requires context ( { log, config } ).
    this.init = function( ctx ) {
        let { config, log } = ctx;
        let logmqtt = config.logMqtt;
        var clientId = 'mqttthing_' + config.name.replace(/[^\x20-\x7F]/g, "") + '_' + Math.random().toString(16).substr(2, 8);

        // start with any configured options object
        var options = config.mqttOptions || {};

        // standard options set by mqtt-thing
        var myOptions = {
            keepalive: 10,
            clientId: clientId,
            protocolId: 'MQTT',
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 1000,
            connectTimeout: 30 * 1000,
            will: {
                topic: 'WillMsg',
                payload: 'Connection Closed abnormally..!',
                qos: 0,
                retain: false
            },
            username: config.username,
            password: config.password,
            rejectUnauthorized: false
        };

        // copy standard options into options unless already set by user
        for( var opt in myOptions ) {
            if( myOptions.hasOwnProperty( opt ) && ! options.hasOwnProperty( opt ) ) {
                options[ opt ] = myOptions[ opt ];
            }
        }

        if( logmqtt ) {
            log( 'MQTT options: ' + JSON.stringify( options, function( k, v ) {
                if( k == "password" ) {
                    return undefined; // filter out
                }
                return v;
            } ) );
        }

        // create MQTT client
        var mqttClient = mqtt.connect(config.url, options);
        mqttClient.on('error', function (err) {
            log('MQTT Error: ' + err);
        });

        mqttClient.on('message', function (topic, message) {
            if (logmqtt) {
                log("Received MQTT: " + topic + " = " + message);
            } else {
                log("** Received MQTT: " + topic + " = " + message);
            }
            var handlers = mqttDispatch[topic];
            if (handlers) {
                for( var i = 0; i < handlers.length; i++ ) {
                    handlers[ i ]( topic, message );
                }
            } else {
                log('Warning: No MQTT dispatch handler for topic [' + topic + ']');
            }
        });

        ctx.mqttClient = mqttClient;
        return mqttClient;
    };

    // Subscribe
    this.subscribe = function( ctx, topic, handler ) {
        let { log, mqttClient } = ctx;
        if( ! mqttClient ) {
            log( 'ERROR: Call mqttlib.init() before mqttlib.subscribe()' );
            return;
        }

        if (typeof topic != 'string') {
            var extendedTopic = topic;
            topic = extendedTopic.topic;
            if (extendedTopic.hasOwnProperty('apply')) {
                var previous = handler;
                var applyFn = Function("message", extendedTopic['apply']); //eslint-disable-line
                handler = function (intopic, message) {
                    let decoded;
                    try {
                        decoded = applyFn( message );
                    } catch( ex ) {
                        log( 'Decode function apply( message) { ' + extendedTopic.apply + ' } failed for topic ' + topic + ' with message ' + message + ' - ' + ex );
                    }
                    if( decoded !== undefined ) {
                        return previous( intopic, decoded );
                    }
                };
            }
        }
        if( mqttDispatch.hasOwnProperty( topic ) ) {
            // new handler for existing topic
            mqttDispatch[ topic ].push( handler );
        } else {
            // new topic
            mqttDispatch[ topic ] = [ handler ];
            mqttClient.subscribe(topic);
        }
    };

    // Publish
    this.publish = function( ctx, topic, message ) {
        let { config, log, mqttClient } = ctx;
        if( ! mqttClient ) {
            log( 'ERROR: Call mqttlib.init() before mqttlib.publish()' );
            return;
        }

        if( message === null || topic === undefined ) {
            return; // don't publish if message is null or topic is undefined
        }

        if (typeof topic != 'string') {
            // encode data with user-supplied apply() function
            var extendedTopic = topic;
            topic = extendedTopic.topic;
            if (extendedTopic.hasOwnProperty('apply')) {
                var applyFn = Function("message", extendedTopic['apply']); //eslint-disable-line
                try {
                    message = applyFn(message);
                } catch( ex ) {
                    log( 'Encode function apply( message ) { ' + extendedTopic.apply + ' } failed for topic ' + topic + ' with message ' + message + ' - ' + ex );
                    message = null; // stop publish
                }
                if( message === null ) {
                    return;
                }
            }
        }

        // publish
        if( config.logMqtt ) {
            log( 'Publishing MQTT: ' + topic + ' = ' + message );
        }
        mqttClient.publish(topic, message.toString(), config.mqttPubOptions );
    };


};

module.exports = mqttlib;
