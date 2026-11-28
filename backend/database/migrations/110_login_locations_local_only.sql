-- 110: past login locations are worked out again on this server.
--
-- Until the local location database (helios #259, decision D-075), login
-- locations came from an outside lookup service, which also stored the city,
-- network provider and time zone, and labelled private addresses as country
-- 'XX' "Private Network" at latitude/longitude 0,0. The local lookup stores
-- country and state or province only, and only fills rows that have no
-- country yet, so rows located by the old service were never revisited and
-- kept data this product no longer keeps.
--
-- This clears every location field on those rows. The next login pull fills
-- country and state or province again from the local database; private
-- addresses stay without a location, as new ones do.
--
-- Rows written by the old service are the only ones with a city, a network
-- provider, a time zone or the 'XX' country: the local lookup writes none of
-- those. Additive and re-runnable: a second run matches nothing.

UPDATE login_activity
   SET country_code = NULL,
       country_name = NULL,
       region       = NULL,
       latitude     = NULL,
       longitude    = NULL,
       city         = NULL,
       isp          = NULL,
       timezone     = NULL
 WHERE city IS NOT NULL
    OR isp IS NOT NULL
    OR timezone IS NOT NULL
    OR country_code = 'XX';
