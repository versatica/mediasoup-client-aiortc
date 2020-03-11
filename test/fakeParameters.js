const { v4: uuidv4 } = require('uuid');

exports.generateRouterRtpCapabilities = function()
{
	return {
		codecs :
		[
			{
				mimeType             : 'audio/opus',
				kind                 : 'audio',
				preferredPayloadType : 100,
				clockRate            : 48000,
				channels             : 2,
				rtcpFeedback         : [],
				parameters           :
				{
					useinbandfec : 1,
					foo          : 'bar'
				}
			},
			{
				mimeType             : 'video/VP8',
				kind                 : 'video',
				preferredPayloadType : 101,
				clockRate            : 90000,
				rtcpFeedback         :
				[
					{ type: 'nack' },
					{ type: 'nack', parameter: 'pli' },
					{ type: 'ccm', parameter: 'fir' },
					{ type: 'goog-remb' }
				],
				parameters :
				{
					'x-google-start-bitrate' : 1500
				}
			},
			{
				mimeType             : 'video/rtx',
				kind                 : 'video',
				preferredPayloadType : 102,
				clockRate            : 90000,
				rtcpFeedback         : [],
				parameters           :
				{
					apt : 101
				}
			},
			{
				mimeType             : 'video/H264',
				kind                 : 'video',
				preferredPayloadType : 103,
				clockRate            : 90000,
				rtcpFeedback         :
				[
					{ type: 'nack' },
					{ type: 'nack', parameter: 'pli' },
					{ type: 'ccm', parameter: 'fir' },
					{ type: 'goog-remb' }
				],
				parameters :
				{
					'level-asymmetry-allowed' : 1,
					'packetization-mode'      : 1,
					'profile-level-id'        : '42e01f'
				}
			},
			{
				mimeType             : 'video/rtx',
				kind                 : 'video',
				preferredPayloadType : 104,
				clockRate            : 90000,
				rtcpFeedback         : [],
				parameters           :
				{
					apt : 103
				}
			}
		],
		headerExtensions :
		[
			{
				kind             : 'audio',
				uri              : 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
				preferredId      : 1,
				preferredEncrypt : false
			},
			{
				kind             : 'video',
				uri              : 'urn:ietf:params:rtp-hdrext:toffset',
				preferredId      : 2,
				preferredEncrypt : false
			},
			{
				kind             : 'audio',
				uri              : 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time', // eslint-disable-line max-len
				preferredId      : 3,
				preferredEncrypt : false
			},
			{
				kind             : 'video',
				uri              : 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time', // eslint-disable-line max-len
				preferredId      : 3,
				preferredEncrypt : false
			},
			{
				kind             : 'video',
				uri              : 'urn:3gpp:video-orientation',
				preferredId      : 4,
				preferredEncrypt : false
			},
			{
				kind             : 'audio',
				uri              : 'urn:ietf:params:rtp-hdrext:sdes:mid',
				preferredId      : 5,
				preferredEncrypt : false
			},
			{
				kind             : 'video',
				uri              : 'urn:ietf:params:rtp-hdrext:sdes:mid',
				preferredId      : 5,
				preferredEncrypt : false
			},
			{
				kind             : 'video',
				uri              : 'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id',
				preferredId      : 6,
				preferredEncrypt : false
			}
		],
		fecMechanisms : []
	};
};

exports.generateTransportRemoteParameters = function()
{
	return {
		id            : uuidv4(),
		iceParameters :
		{
			iceLite          : true,
			password         : 'yku5ej8nvfaor28lvtrabcx0wkrpkztz',
			usernameFragment : 'h3hk1iz6qqlnqlne'
		},
		iceCandidates :
		[
			{
				family     : 'ipv4',
				foundation : 'udpcandidate',
				ip         : '9.9.9.9',
				port       : 40533,
				priority   : 1078862079,
				protocol   : 'udp',
				type       : 'host'
			},
			{
				family     : 'ipv6',
				foundation : 'udpcandidate',
				ip         : '9:9:9:9:9:9',
				port       : 41333,
				priority   : 1078862089,
				protocol   : 'udp',
				type       : 'host'
			}
		],
		dtlsParameters :
		{
			fingerprints :
			[
				{
					algorithm : 'sha-256',
					value     : 'A9:F4:E0:D2:74:D3:0F:D9:CA:A5:2F:9F:7F:47:FA:F0:C4:72:DD:73:49:D0:3B:14:90:20:51:30:1B:90:8E:71'
				},
				{
					algorithm : 'sha-384',
					value     : '03:D9:0B:87:13:98:F6:6D:BC:FC:92:2E:39:D4:E1:97:32:61:30:56:84:70:81:6E:D1:82:97:EA:D9:C1:21:0F:6B:C5:E7:7F:E1:97:0C:17:97:6E:CF:B3:EF:2E:74:B0'
				},
				{
					algorithm : 'sha-512',
					value     : '84:27:A4:28:A4:73:AF:43:02:2A:44:68:FF:2F:29:5C:3B:11:9A:60:F4:A8:F0:F5:AC:A0:E3:49:3E:B1:34:53:A9:85:CE:51:9B:ED:87:5E:B8:F4:8E:3D:FA:20:51:B8:96:EE:DA:56:DC:2F:5C:62:79:15:23:E0:21:82:2B:2C'
				}
			],
			role : 'auto'
		},
		sctpParameters :
		{
			port           : 5000,
			numStreams     : 2048,
			maxMessageSize : 2000000
		}
	};
};

exports.generateProducerRemoteParameters = function()
{
	return {
		id : uuidv4()
	};
};

exports.generateConsumerRemoteParameters = function({ id, codecMimeType } = {})
{
	switch (codecMimeType)
	{
		case 'audio/opus':
		{
			return {
				id            : id || uuidv4(),
				producerId    : uuidv4(),
				kind          : 'audio',
				rtpParameters :
				{
					codecs :
					[
						{
							mimeType     : 'audio/opus',
							payloadType  : 100,
							clockRate    : 48000,
							channels     : 2,
							rtcpFeedback : [],
							parameters   :
							{
								useinbandfec : 1,
								foo          : 'bar'
							}
						}
					],
					encodings :
					[
						{
							ssrc : 46687003
						}
					],
					headerExtensions : [],
					rtcp             :
					{
						cname       : 'wB4Ql4lrsxYLjzuN',
						reducedSize : true,
						mux         : true
					}
				}
			};
		}

		case 'audio/ISAC':
		{
			return {
				id            : id || uuidv4(),
				producerId    : uuidv4(),
				kind          : 'audio',
				rtpParameters :
				{
					codecs :
					[
						{
							mimeType     : 'audio/ISAC',
							payloadType  : 111,
							clockRate    : 16000,
							channels     : 1,
							rtcpFeedback : [],
							parameters   : {}
						}
					],
					encodings :
					[
						{
							ssrc : 46687004
						}
					],
					headerExtensions : [],
					rtcp             :
					{
						cname       : 'wB4Ql4lrsxYLjzuN',
						reducedSize : true,
						mux         : true
					}
				}
			};
		}

		case 'video/VP8':
		{
			return {
				id            : id || uuidv4(),
				producerId    : uuidv4(),
				kind          : 'video',
				rtpParameters :
				{
					codecs :
					[
						{
							mimeType     : 'video/VP8',
							payloadType  : 101,
							clockRate    : 90000,
							rtcpFeedback :
							[
								{ type: 'nack' },
								{ type: 'nack', parameter: 'pli' },
								{ type: 'ccm', parameter: 'fir' },
								{ type: 'goog-remb' }
							],
							parameters :
							{
								'x-google-start-bitrate' : 1500
							}
						},
						{
							mimeType     : 'video/rtx',
							payloadType  : 102,
							clockRate    : 90000,
							rtcpFeedback : [],
							parameters   :
							{
								apt : 101
							}
						}
					],
					encodings :
					[
						{
							ssrc : 99991111,
							rtx  :
							{
								ssrc : 99991112
							}
						}
					],
					headerExtensions :
					[
						{
							uri : 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time', // eslint-disable-line max-len
							id  : 3
						}
					],
					rtcp :
					{
						cname       : 'wB4Ql4lrsxYLjzuN',
						reducedSize : true,
						mux         : true
					}
				}
			};
		}

		default:
		{
			throw new TypeError(`unknown codecMimeType "${codecMimeType}"`);
		}
	}
};

exports.generateDataProducerRemoteParameters = function()
{
	return {
		id : uuidv4()
	};
};

exports.generateDataConsumerRemoteParameters = function({ id } = {})
{
	return {
		id                   : id || uuidv4(),
		dataProducerId       : uuidv4(),
		sctpStreamParameters :
		{
			streamId          : 666,
			maxPacketLifeTime : 5000,
			maxRetransmits    : undefined
		}
	};
};
