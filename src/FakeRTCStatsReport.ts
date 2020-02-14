export class FakeRTCStatsReport extends Map implements RTCStatsReport
{
	/**
	 * Given data must be an object whose keys are the id of each RTCStats and
	 * their values the corresponding RTCStats objects.
	 */
	constructor(data: { [key: string]: any })
	{
		super();

		// Fill this map with the given data object.
		for (const key of Object.keys(data))
		{
			this.set(key, data[key]);
		}
	}
}
