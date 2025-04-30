export type NotionBlogProperties = {
  object: string;
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: {
    object: string;
    id: string;
  };
  last_edited_by: {
    object: string;
    id: string;
  };
  cover: null;
  icon: null;
  parent: {
    type: string;
    database_id: string;
  };
  archived: boolean;
  in_trash: boolean;
  properties: {
    date: {
      id: string;
      type: string;
      date: {
        start: string;
        end: null;
        time_zone: null;
      } | null;
    } | null;
    published: {
      id: string;
      type: string;
      checkbox: boolean;
    };
    tags: {
      id: string;
      type: string;
      multi_select: {
        color: string;
        id: string;
        name: string;
      }[];
    };
    authors: {
      id: string;
      type: string;
      people:
        | [
            {
              object: string;
              id: string;
              name: string;
              avatar_url: string;
              type: string;
              person: {
                email: string;
              };
            }
          ]
        | never[];
    };
    slug: {
      id: string;
      type: string;
      rich_text: [
        {
          type: string;
          text: {
            content: string;
            link: null;
          };
          annotations: {
            bold: boolean;
            italic: boolean;
            strikethrough: boolean;
            underline: boolean;
            code: boolean;
            color: string;
          };
          plain_text: string;
          href: null;
        }
      ];
    };
    Page: {
      id: string;
      type: string;
      title: [
        {
          type: string;
          text: {
            content: string;
            link: null;
          };
          annotations: {
            bold: boolean;
            italic: boolean;
            strikethrough: boolean;
            underline: boolean;
            code: boolean;
            color: string;
          };
          plain_text: string;
          href: null;
        }
      ];
    };
  };
  url: string;
  public_url: string | null;
};

export type NotionPage = {
  object: string;
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: {
    object: string;
    id: string;
  };
  last_edited_by: {
    object: string;
    id: string;
  };
  cover: string | null;
  icon: string | null;
  parent: {
    type: string;
    database_id: string;
  };
  archived: false;
  in_trash: false;
  properties: {
    date: {
      id: string;
      type: string;
      date: {
        start: string;
        end: null;
        time_zone: null;
      } | null;
    } | null;
    published: {
      id: string;
      type: string;
      checkbox: boolean;
    };
    tags: {
      id: string;
      type: string;
      multi_select: [
        {
          id: string;
          name: string;
          color: string;
        },
        {
          id: string;
          name: string;
          color: string;
        }
      ];
    };
    authors: {
      id: string;
      type: string;
      people:
        | [
            {
              object: string;
              id: string;
              name: string;
              avatar_url: string | null;
              type: string;
              person: {
                email: string;
              };
            }
          ]
        | never[];
    };
    slug: {
      id: string;
      type: string;
      rich_text: [
        {
          type: string;
          text: {
            content: string;
            link: string | null;
          };
          annotations: {
            bold: boolean;
            italic: boolean;
            strikethrough: boolean;
            underline: boolean;
            code: boolean;
            color: string;
          };
          plain_text: string;
          href: string | null;
        }
      ];
    };
    Page: {
      id: string;
      type: string;
      title: [
        {
          type: string;
          text: {
            content: string;
            link: string | null;
          };
          annotations: {
            bold: boolean;
            italic: boolean;
            strikethrough: boolean;
            underline: boolean;
            code: boolean;
            color: string;
          };
          plain_text: string;
          href: null;
        }
      ];
    };
  };
  url: string;
  public_url: boolean | null;
  request_id: string;
};
