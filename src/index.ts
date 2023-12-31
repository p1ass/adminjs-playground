import {Prisma, PrismaClient} from '@prisma/client'
import express from 'express'
import AdminJS, {ActionHandler, AdminJSOptions, RecordActionResponse,ResourceWithOptions} from 'adminjs'
import AdminJSExpress from '@adminjs/express'
import {Database, Resource, getModelByName} from '@adminjs/prisma'

const prisma = new PrismaClient()
const app = express()

app.use(express.json())

AdminJS.registerAdapter({
  Resource: Resource,
  Database: Database,
})

const publishActionHandler: ActionHandler<RecordActionResponse> = async (request, response, context) => {
  const post = context.record!
  post.set('published', true)
  await post.save(context)
  return {
    notice: {
      message: "公開されました🚀"
    },
    record: post.toJSON(context.currentAdmin)
  }
}
const postResource:ResourceWithOptions = {
  resource: { model: getModelByName('Post'), client: prisma },
  options: {
    actions: {
      publish: {
        actionType: 'record',
        component: false,
        handler: publishActionHandler,
      },
    },
  },
}

const adminOptions:AdminJSOptions = {
  resources: [
    postResource,
    {resource: {model: getModelByName('User'), client: prisma}, options: {},},
  ]
}

const admin = new AdminJS(adminOptions)
const adminRouter = AdminJSExpress.buildRouter(admin)
app.use(admin.options.rootPath, adminRouter)

app.post(`/signup`, async (req, res) => {
  const {name, email, posts} = req.body

  const postData = posts?.map((post: Prisma.PostCreateInput) => {
    return {title: post?.title, content: post?.content}
  })

  const result = await prisma.user.create({
    data: {
      name,
      email,
      posts: {
        create: postData,
      },
    },
  })
  res.json(result)
})

app.post(`/post`, async (req, res) => {
  const {title, content, authorEmail} = req.body
  const result = await prisma.post.create({
    data: {
      title,
      content,
      author: {connect: {email: authorEmail}},
    },
  })
  res.json(result)
})

app.put('/post/:id/views', async (req, res) => {
  const {id} = req.params

  try {
    const post = await prisma.post.update({
      where: {id: Number(id)},
      data: {
        viewCount: {
          increment: 1,
        },
      },
    })

    res.json(post)
  } catch (error) {
    res.json({error: `Post with ID ${id} does not exist in the database`})
  }
})

app.put('/publish/:id', async (req, res) => {
  const {id} = req.params

  try {
    const postData = await prisma.post.findUnique({
      where: {id: Number(id)},
      select: {
        published: true,
      },
    })

    const updatedPost = await prisma.post.update({
      where: {id: Number(id) || undefined},
      data: {published: !postData?.published},
    })
    res.json(updatedPost)
  } catch (error) {
    res.json({error: `Post with ID ${id} does not exist in the database`})
  }
})

app.delete(`/post/:id`, async (req, res) => {
  const {id} = req.params
  const post = await prisma.post.delete({
    where: {
      id: Number(id),
    },
  })
  res.json(post)
})

app.get('/users', async (req, res) => {
  const users = await prisma.user.findMany()
  res.json(users)
})

app.get('/user/:id/drafts', async (req, res) => {
  const {id} = req.params

  const drafts = await prisma.user
  .findUnique({
    where: {
      id: Number(id),
    },
  })
  .posts({
    where: {published: false},
  })

  res.json(drafts)
})

app.get(`/post/:id`, async (req, res) => {
  const {id}: { id?: string } = req.params

  const post = await prisma.post.findUnique({
    where: {id: Number(id)},
  })
  res.json(post)
})

app.get('/feed', async (req, res) => {
  const {searchString, skip, take, orderBy} = req.query

  const or: Prisma.PostWhereInput = searchString
      ? {
        OR: [
          {title: {contains: searchString as string}},
          {content: {contains: searchString as string}},
        ],
      }
      : {}

  const posts = await prisma.post.findMany({
    where: {
      published: true,
      ...or,
    },
    include: {author: true},
    take: Number(take) || undefined,
    skip: Number(skip) || undefined,
    orderBy: {
      updatedAt: orderBy as Prisma.SortOrder,
    },
  })

  res.json(posts)
})

const server = app.listen(3000, () =>
    console.log(`
🚀 Server ready at: http://localhost:3000${admin.options.rootPath}
⭐️ See sample requests: http://pris.ly/e/ts/rest-express#3-using-the-rest-api`),
)
