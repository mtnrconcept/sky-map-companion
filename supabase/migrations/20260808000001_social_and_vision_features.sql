--Tablepourlesimagesuploadéesparlesutilisateurs
CREATETABLEpublic.user_images(
iduuidPRIMARYKEYDEFAULTgen_random_uuid(),
user_iduuidNOTNULLREFERENCESauth.usersONDELETECASCADE,
object_idtextNOTNULL,
object_nametextNOTNULL,
image_urltextNOTNULL,
thumbnail_urltext,
storage_pathtextNOTNULL,
file_sizebigintNOTNULL,
mime_typetextNOTNULL,
widthinteger,
heightinteger,
uploaded_attimestamptzNOTNULLDEFAULTnow(),
is_ai_generatedbooleanDEFAULTfalse,
ai_detection_scorefloat,
ai_detection_metadatajsonb,
vision_analysisjsonb,
metadatajsonb,
CONSTRAINTvalid_mime_typeCHECK(mime_typeIN('image/jpeg','image/png','image/webp'))
);

CREATEINDEXidx_user_images_user_idONpublic.user_images(user_id);
CREATEINDEXidx_user_images_object_idONpublic.user_images(object_id);
CREATEINDEXidx_user_images_uploaded_atONpublic.user_images(uploaded_atDESC);
CREATEINDEXidx_user_images_ai_generatedONpublic.user_images(is_ai_generated)WHEREis_ai_generated=false;

GRANTSELECTONpublic.user_imagesTOauthenticated,anon;
GRANTINSERT,UPDATE,DELETEONpublic.user_imagesTOauthenticated;
GRANTALLONpublic.user_imagesTOservice_role;

ALTERTABLEpublic.user_imagesENABLEROWLEVELSECURITY;

CREATEPOLICY"anyone_view_images"ONpublic.user_imagesFORSELECTUSING(true);
CREATEPOLICY"users_insert_own_images"ONpublic.user_imagesFORINSERTTOauthenticatedWITHCHECK(auth.uid()=user_id);
CREATEPOLICY"users_update_own_images"ONpublic.user_imagesFORUPDATETOauthenticatedUSING(auth.uid()=user_id);
CREATEPOLICY"users_delete_own_images"ONpublic.user_imagesFORDELETETOauthenticatedUSING(auth.uid()=user_id);

--Tablepourlesanalysescomparativesd'images
CREATETABLEpublic.image_comparisons(
iduuidPRIMARYKEYDEFAULTgen_random_uuid(),
object_idtextNOTNULL,
image_idsuuid[]NOTNULL,
comparison_datetimestamptzNOTNULLDEFAULTnow(),
differences_detectedjsonb,
discoveriesjsonb,
confidence_scorefloat,
analysis_metadatajsonb,
created_attimestamptzNOTNULLDEFAULTnow()
);

CREATEINDEXidx_image_comparisons_object_idONpublic.image_comparisons(object_id);
CREATEINDEXidx_image_comparisons_dateONpublic.image_comparisons(comparison_dateDESC);

GRANTSELECTONpublic.image_comparisonsTOauthenticated,anon;
GRANTALLONpublic.image_comparisonsTOservice_role;

ALTERTABLEpublic.image_comparisonsENABLEROWLEVELSECURITY;

CREATEPOLICY"anyone_view_comparisons"ONpublic.image_comparisonsFORSELECTUSING(true);

--Extensionduprofilutilisateurpourleréseausocial
ALTERTABLEpublic.profilesADDCOLUMNIFNOTEXISTSbiotext;
ALTERTABLEpublic.profilesADDCOLUMNIFNOTEXISTSavatar_urltext;
ALTERTABLEpublic.profilesADDCOLUMNIFNOTEXISTSwebsitetext;
ALTERTABLEpublic.profilesADDCOLUMNIFNOTEXISTSlocationtext;
ALTERTABLEpublic.profilesADDCOLUMNIFNOTEXISTSfollowers_countintegerDEFAULT0;
ALTERTABLEpublic.profilesADDCOLUMNIFNOTEXISTSfollowing_countintegerDEFAULT0;
ALTERTABLEpublic.profilesADDCOLUMNIFNOTEXISTSposts_countintegerDEFAULT0;

--Tabledesfollows(doitêtrecrééeavantpostspourlaRLSpolicy)
CREATETABLEpublic.follows(
iduuidPRIMARYKEYDEFAULTgen_random_uuid(),
follower_iduuidNOTNULLREFERENCESauth.usersONDELETECASCADE,
following_iduuidNOTNULLREFERENCESauth.usersONDELETECASCADE,
created_attimestamptzNOTNULLDEFAULTnow(),
UNIQUE(follower_id,following_id),
CHECK(follower_id!=following_id)
);

CREATEINDEXidx_follows_followerONpublic.follows(follower_id);
CREATEINDEXidx_follows_followingONpublic.follows(following_id);

GRANTSELECTONpublic.followsTOauthenticated,anon;
GRANTINSERT,DELETEONpublic.followsTOauthenticated;
GRANTALLONpublic.followsTOservice_role;

ALTERTABLEpublic.followsENABLEROWLEVELSECURITY;

CREATEPOLICY"anyone_view_follows"ONpublic.followsFORSELECTUSING(true);
CREATEPOLICY"users_insert_follows"ONpublic.followsFORINSERTTOauthenticatedWITHCHECK(auth.uid()=follower_id);
CREATEPOLICY"users_delete_own_follows"ONpublic.followsFORDELETETOauthenticatedUSING(auth.uid()=follower_id);

--Tabledesposts(fild'actualités)
CREATETABLEpublic.posts(
iduuidPRIMARYKEYDEFAULTgen_random_uuid(),
user_iduuidNOTNULLREFERENCESauth.usersONDELETECASCADE,
contenttextNOTNULL,
object_idtext,
object_nametext,
image_idsuuid[]DEFAULT'{}',
likes_countintegerDEFAULT0,
comments_countintegerDEFAULT0,
shares_countintegerDEFAULT0,
visibilitytextDEFAULT'public'CHECK(visibilityIN('public','followers','private')),
created_attimestamptzNOTNULLDEFAULTnow(),
updated_attimestamptzNOTNULLDEFAULTnow()
);

CREATEINDEXidx_posts_user_idONpublic.posts(user_id);
CREATEINDEXidx_posts_created_atONpublic.posts(created_atDESC);
CREATEINDEXidx_posts_object_idONpublic.posts(object_id)WHEREobject_idISNOTNULL;

GRANTSELECTONpublic.postsTOauthenticated,anon;
GRANTINSERT,UPDATE,DELETEONpublic.postsTOauthenticated;
GRANTALLONpublic.postsTOservice_role;

ALTERTABLEpublic.postsENABLEROWLEVELSECURITY;

CREATEPOLICY"anyone_view_public_posts"ONpublic.postsFORSELECTUSING(
visibility='public'OR
(auth.uid()=user_id)OR
(visibility='followers'ANDEXISTS(
SELECT1FROMpublic.followsWHEREfollower_id=auth.uid()ANDfollowing_id=user_id
))
);

CREATEPOLICY"users_insert_own_posts"ONpublic.postsFORINSERTTOauthenticatedWITHCHECK(auth.uid()=user_id);
CREATEPOLICY"users_update_own_posts"ONpublic.postsFORUPDATETOauthenticatedUSING(auth.uid()=user_id);
CREATEPOLICY"users_delete_own_posts"ONpublic.postsFORDELETETOauthenticatedUSING(auth.uid()=user_id);

--Tabledeslikes
CREATETABLEpublic.likes(
iduuidPRIMARYKEYDEFAULTgen_random_uuid(),
user_iduuidNOTNULLREFERENCESauth.usersONDELETECASCADE,
post_iduuidNOTNULLREFERENCESpublic.postsONDELETECASCADE,
created_attimestamptzNOTNULLDEFAULTnow(),
UNIQUE(user_id,post_id)
);

CREATEINDEXidx_likes_post_idONpublic.likes(post_id);
CREATEINDEXidx_likes_user_idONpublic.likes(user_id);

GRANTSELECT,INSERT,DELETEONpublic.likesTOauthenticated;
GRANTALLONpublic.likesTOservice_role;

ALTERTABLEpublic.likesENABLEROWLEVELSECURITY;

CREATEPOLICY"anyone_view_likes"ONpublic.likesFORSELECTUSING(true);
CREATEPOLICY"users_insert_likes"ONpublic.likesFORINSERTTOauthenticatedWITHCHECK(auth.uid()=user_id);
CREATEPOLICY"users_delete_own_likes"ONpublic.likesFORDELETETOauthenticatedUSING(auth.uid()=user_id);

--Tabledescommentaires
CREATETABLEpublic.comments(
iduuidPRIMARYKEYDEFAULTgen_random_uuid(),
user_iduuidNOTNULLREFERENCESauth.usersONDELETECASCADE,
post_iduuidNOTNULLREFERENCESpublic.postsONDELETECASCADE,
contenttextNOTNULL,
parent_comment_iduuidREFERENCESpublic.commentsONDELETECASCADE,
created_attimestamptzNOTNULLDEFAULTnow(),
updated_attimestamptzNOTNULLDEFAULTnow()
);

CREATEINDEXidx_comments_post_idONpublic.comments(post_id);
CREATEINDEXidx_comments_user_idONpublic.comments(user_id);
CREATEINDEXidx_comments_parent_idONpublic.comments(parent_comment_id)WHEREparent_comment_idISNOTNULL;

GRANTSELECTONpublic.commentsTOauthenticated,anon;
GRANTINSERT,UPDATE,DELETEONpublic.commentsTOauthenticated;
GRANTALLONpublic.commentsTOservice_role;

ALTERTABLEpublic.commentsENABLEROWLEVELSECURITY;

CREATEPOLICY"anyone_view_comments"ONpublic.commentsFORSELECTUSING(true);
CREATEPOLICY"users_insert_comments"ONpublic.commentsFORINSERTTOauthenticatedWITHCHECK(auth.uid()=user_id);
CREATEPOLICY"users_update_own_comments"ONpublic.commentsFORUPDATETOauthenticatedUSING(auth.uid()=user_id);
CREATEPOLICY"users_delete_own_comments"ONpublic.commentsFORDELETETOauthenticatedUSING(auth.uid()=user_id);

--Tabledespartages
CREATETABLEpublic.shares(
iduuidPRIMARYKEYDEFAULTgen_random_uuid(),
user_iduuidNOTNULLREFERENCESauth.usersONDELETECASCADE,
post_iduuidNOTNULLREFERENCESpublic.postsONDELETECASCADE,
created_attimestamptzNOTNULLDEFAULTnow()
);

CREATEINDEXidx_shares_post_idONpublic.shares(post_id);
CREATEINDEXidx_shares_user_idONpublic.shares(user_id);

GRANTSELECT,INSERTONpublic.sharesTOauthenticated;
GRANTALLONpublic.sharesTOservice_role;

ALTERTABLEpublic.sharesENABLEROWLEVELSECURITY;

CREATEPOLICY"anyone_view_shares"ONpublic.sharesFORSELECTUSING(true);
CREATEPOLICY"users_insert_shares"ONpublic.sharesFORINSERTTOauthenticatedWITHCHECK(auth.uid()=user_id);

--Triggerspourmettreàjourlescompteurs
CREATEORREPLACEFUNCTIONupdate_post_likes_count()
RETURNSTRIGGERAS$$
BEGIN
IFTG_OP='INSERT'THEN
UPDATEpublic.postsSETlikes_count=likes_count+1WHEREid=NEW.post_id;
ELSIFTG_OP='DELETE'THEN
UPDATEpublic.postsSETlikes_count=likes_count-1WHEREid=OLD.post_id;
ENDIF;
RETURNNULL;
END;
$$LANGUAGEplpgsql;

CREATETRIGGERtrigger_update_likes_count
AFTERINSERTORDELETEONpublic.likes
FOREACHROWEXECUTEFUNCTIONupdate_post_likes_count();

CREATEORREPLACEFUNCTIONupdate_post_comments_count()
RETURNSTRIGGERAS$$
BEGIN
IFTG_OP='INSERT'THEN
UPDATEpublic.postsSETcomments_count=comments_count+1WHEREid=NEW.post_id;
ELSIFTG_OP='DELETE'THEN
UPDATEpublic.postsSETcomments_count=comments_count-1WHEREid=OLD.post_id;
ENDIF;
RETURNNULL;
END;
$$LANGUAGEplpgsql;

CREATETRIGGERtrigger_update_comments_count
AFTERINSERTORDELETEONpublic.comments
FOREACHROWEXECUTEFUNCTIONupdate_post_comments_count();

CREATEORREPLACEFUNCTIONupdate_post_shares_count()
RETURNSTRIGGERAS$$
BEGIN
UPDATEpublic.postsSETshares_count=shares_count+1WHEREid=NEW.post_id;
RETURNNULL;
END;
$$LANGUAGEplpgsql;

CREATETRIGGERtrigger_update_shares_count
AFTERINSERTONpublic.shares
FOREACHROWEXECUTEFUNCTIONupdate_post_shares_count();

CREATEORREPLACEFUNCTIONupdate_follow_counts()
RETURNSTRIGGERAS$$
BEGIN
IFTG_OP='INSERT'THEN
UPDATEpublic.profilesSETfollowing_count=following_count+1WHEREid=NEW.follower_id;
UPDATEpublic.profilesSETfollowers_count=followers_count+1WHEREid=NEW.following_id;
ELSIFTG_OP='DELETE'THEN
UPDATEpublic.profilesSETfollowing_count=following_count-1WHEREid=OLD.follower_id;
UPDATEpublic.profilesSETfollowers_count=followers_count-1WHEREid=OLD.following_id;
ENDIF;
RETURNNULL;
END;
$$LANGUAGEplpgsql;

CREATETRIGGERtrigger_update_follow_counts
AFTERINSERTORDELETEONpublic.follows
FOREACHROWEXECUTEFUNCTIONupdate_follow_counts();

CREATEORREPLACEFUNCTIONupdate_posts_count()
RETURNSTRIGGERAS$$
BEGIN
IFTG_OP='INSERT'THEN
UPDATEpublic.profilesSETposts_count=posts_count+1WHEREid=NEW.user_id;
ELSIFTG_OP='DELETE'THEN
UPDATEpublic.profilesSETposts_count=posts_count-1WHEREid=OLD.user_id;
ENDIF;
RETURNNULL;
END;
$$LANGUAGEplpgsql;

CREATETRIGGERtrigger_update_posts_count
AFTERINSERTORDELETEONpublic.posts
FOREACHROWEXECUTEFUNCTIONupdate_posts_count();

--Fonctionpourobtenirlefeedpersonnalisé
CREATEORREPLACEFUNCTIONget_user_feed(user_uuiduuid,limit_countintegerDEFAULT20,offset_countintegerDEFAULT0)
RETURNSTABLE(
post_iduuid,
user_iduuid,
display_nametext,
avatar_urltext,
contenttext,
object_idtext,
object_nametext,
image_idsuuid[],
likes_countinteger,
comments_countinteger,
shares_countinteger,
created_attimestamptz,
user_likedboolean
)AS$$
BEGIN
RETURNQUERY
SELECT
p.id,
p.user_id,
prof.display_name,
prof.avatar_url,
p.content,
p.object_id,
p.object_name,
p.image_ids,
p.likes_count,
p.comments_count,
p.shares_count,
p.created_at,
EXISTS(SELECT1FROMpublic.likeslWHEREl.post_id=p.idANDl.user_id=user_uuid)asuser_liked
FROMpublic.postsp
INNERJOINpublic.profilesprofONp.user_id=prof.id
WHERE
p.visibility='public'
ORp.user_id=user_uuid
OR(p.visibility='followers'ANDEXISTS(
SELECT1FROMpublic.followsfWHEREf.follower_id=user_uuidANDf.following_id=p.user_id
))
ORDERBYp.created_atDESC
LIMITlimit_count
OFFSEToffset_count;
END;
$$LANGUAGEplpgsqlSECURITYDEFINER;

--Storagebuckets(àcréervial'interfaceSupabaseStorage)
--user-images:imagesuploadéesparlesutilisateurs
--user-avatars:avatarsdesprofils